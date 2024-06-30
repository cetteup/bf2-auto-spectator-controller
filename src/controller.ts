import * as socketio from 'socket.io';
import * as tmi from 'tmi.js';
import * as http from 'http';
import Config from './config';
import logger from './logger';
import { CommandHandler } from './handlers/typing';
import { authorize } from './permissions';
import {
    ControllerState,
    CustomCommand,
    GamePhaseDTO,
    HaltedPhaseDTO,
    ServerConfig,
    ServerDTO,
    TwitchTokenResponse
} from './typing';
import { debug, next, rejoin, respawn, restart, resume, start, stay, stop } from './handlers/forwarded';
import { ignore, join, joinserver, map, notice, players, server, since, team, top } from './handlers/managed';
import { active, stats, summary } from './handlers/stats';
import { GameServer } from './classes';
import { Logger } from 'tslog';
import * as cron from 'node-cron';
import axios from 'axios';
import { formatOAuthPassword, isAccessTokenValid, isRotationEnabledGamePhase, loadConfig } from './utils';
import { DateTime, Duration } from 'luxon';
import { sendSpectatorCommand } from './commands';
import Queue from './queue';

class Controller {
    private logger: Logger;
    private chatLogger: Logger;

    private oauthTokens: {
        access: string
        refresh?: string
    };

    private readonly server: http.Server;
    private readonly io: socketio.Server;
    private readonly client: tmi.Client;

    private handlers: CommandHandler[];

    private readonly state: ControllerState;

    private serverStateUpdateTask: cron.ScheduledTask;
    private serverScoreUpdateTask: cron.ScheduledTask;

    constructor() {
        this.logger = logger.getChildLogger({ name: 'ControllerLogger' });
        this.chatLogger = logger.getChildLogger({ name: 'ChatLogger' });

        this.oauthTokens = {
            access: Config.CHATBOT_OAUTH_ACCESS_TOKEN,
            refresh: Config.CHATBOT_OAUTH_REFRESH_TOKEN
        };

        this.server = http.createServer();
        this.io = new socketio.Server(this.server);
        this.client = new tmi.Client({
            connection: { reconnect: true },
            identity: {
                username: Config.CHATBOT_USERNAME,
                password: () => this.getClientPassword()
            },
            channels: [Config.SPECTATOR_CHANNEL],
            options: {
                messagesLogLevel: 'debug'
            },
            logger: this.logger.getChildLogger({ name: 'tmiLogger' })
        });

        this.handlers = [
            start, stop, debug, next, respawn, restart, rejoin, resume, stay,
            joinserver, ignore, notice, server, since, join, players, top, map, team,
            stats, summary, active
        ];

        const serverConfigs = loadConfig<ServerConfig>('servers.yaml', 'servers.schema.json');
        this.state = {
            rotationServers: serverConfigs.map((s) => new GameServer(s.ip, s.port, s.password, s.rotationConfig)),
            gamePhase: 'initializing',
            playerRotations: new Queue<DateTime>(Config.AVERAGE_TIME_ON_PLAYER_SAMPLE_SIZE)
        };

        // Update current server's state every 20 seconds
        // (bflist updates at 00, 20 and 40, so get fresh data at 10, 30 and 50)
        this.serverStateUpdateTask = cron.schedule('10,30,50 * * * * *', async () => {
            await this.handleServerStateUpdateTask();
        }, {
            scheduled: false
        });

        // Update server scores according to configured interval (interval influences how fast scores change)
        this.serverScoreUpdateTask = cron.schedule(`*/${Config.ROTATION_SCORE_INTERVAL} * * * *`, async () => {
            await this.handleServerScoreUpdateTask();
        }, {
            scheduled: false
        });
    }

    private async getClientPassword(): Promise<string> {
        // Return current access token if refresh is not possible or access token is still valid
        if (!Config.TWITCH_CLIENT_ID || !Config.TWITCH_CLIENT_SECRET || !this.oauthTokens.refresh || await isAccessTokenValid(this.oauthTokens.access)) {
            return formatOAuthPassword(this.oauthTokens.access);
        }

        const params = new URLSearchParams({
            client_id: Config.TWITCH_CLIENT_ID,
            client_secret: Config.TWITCH_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: this.oauthTokens.refresh
        });

        try {
            const resp = await axios.post('https://id.twitch.tv/oauth2/token', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            const data: TwitchTokenResponse = resp.data;
            this.oauthTokens = {
                access: data.access_token,
                refresh: data.refresh_token
            };
            this.logger.debug('Successfully refreshed chatbot access token');
        }
        catch (e: any) {
            this.logger.error('Failed to refresh chatbot access token:', e.message);
        }

        // We can't really handle any errors during the refresh (e.g. Twitch offline, refresh token invalid),
        // so just return the current access token (refreshed or not)
        return formatOAuthPassword(this.oauthTokens.access);
    }

    private async handleCommand(tags: tmi.ChatUserstate, identifier: string, args: string[]): Promise<void> {
        const handler = this.handlers.find((h) => h.identifier == identifier || h.aliases?.includes(identifier));

        if (!handler || Config.DISABLED_COMMANDS.includes(handler.identifier)) return;

        this.logger.info(tags.username, 'issued command', identifier, ...args);

        if (!authorize(tags, handler.permittedRoles, identifier)) return;

        return handler.execute(this.client, this.io, this.state, args);
    }

    private async handleServerStateUpdateTask(): Promise<void> {
        const updates = this.state.rotationServers.map((s) => {
            this.logger.debug('Updating game server state', s.ip, s.port);
            return s.updateState();
        });
        await Promise.all(updates);
    }

    private async handleServerScoreUpdateTask(): Promise<void> {
        for (const s of this.state.rotationServers) {
            this.logger.debug('Updating game server score', s.ip, s.port);
            s.updateScore();
        }
    }

    private async handleRotationEnabledPhaseEntered(): Promise<void> {
        this.logger.debug('Entered rotation-enabled game phase, running server rotation selection');
        await this.runServerRotationSelection();
    }

    private async handleHaltedPhaseEntered({ server: { ip, port, password }}: HaltedPhaseDTO): Promise<void> {
        const server = this.state.rotationServers.find((s) => {
            return s.ip == ip && s.port == Number(port) && s.password == password;
        });

        if (!server) {
            this.logger.warn('Received halted phase server is not in rotation', ip, port);
        }
        else if (!server.rotationConfig.ignored) {
            this.logger.info('Entered halted phase, ignoring server', ip, port);
            server.rotationConfig.ignored = true;
        }

        this.logger.info('Running server rotation selection to resolve halted phase');
        await this.runServerRotationSelection();
    }

    private async runServerRotationSelection(opts?: {
        allSelectable?: boolean
        ignoreTimeOnServer?: boolean
    }): Promise<void> {
        // Clean up rotation servers before running selection
        this.removeObsoleteRotationServers();

        // Don't run selection if there is no choice to make (e.g. if rotation is not configured/enabled)
        if (this.state.rotationServers.filter((s) => !s.rotationConfig.temporary).length == 0) {
            return;
        }

        const { gamePhase, rotationServers } = this.state;
        const halted = gamePhase == 'halted';
        // When in halted phase, consider any server selectable to enable release from halt
        const allSelectable = opts?.allSelectable || halted;
        const selected = this.selectRotationServer(rotationServers, allSelectable);
        if (!selected) {
            return;
        }

        // Apply selection if the spectator
        // a) is in the halted phase
        // b) is not currently on a server or
        // c) does not currently have a server to join and has stayed on the current server for at least the minimum duration
        const { currentServer, serverToJoin } = this.state;
        const timeOnServer = currentServer?.getTimeOnServer();
        if (halted || !currentServer || !serverToJoin && (timeOnServer && timeOnServer >= Config.MINIMUM_TIME_ON_SERVER || opts?.ignoreTimeOnServer)) {
            if (!selected.equals(currentServer) && !selected.equals(serverToJoin)) {
                this.logger.info('Selected new rotation server', selected.ip, selected.port);
                this.state.serverToJoin = selected;
                selected.join(this.io);

                // Announce server switch if spectator is currently on a server
                if (currentServer) {
                    await this.client.say(Config.SPECTATOR_CHANNEL, `Switching servers, joining ${selected.name} shortly`);
                }
            }

            // Release halted state if server to join (now) is the selected server
            // The spectator would stay in halted phase if we already sent a join server but never issued the release command
            if (selected.equals(this.state.serverToJoin) && halted) {
                this.logger.info('Pending server switch in halted phase, sending release command');
                sendSpectatorCommand(this.io, 'release');
            }
        }
        else if (!serverToJoin && timeOnServer) {
            const switchPossibleAt = DateTime.now().plus(Config.MINIMUM_TIME_ON_SERVER.minus(timeOnServer));
            this.logger.debug('Server switch not possible yet, not applying server selection before', switchPossibleAt.toUTC().toISO());
        }
        else if (serverToJoin) {
            this.logger.debug('Server switch already queued, not applying server selection');
        }
    }

    private setupEventListeners(): void {
        this.client.on('message', async (channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => {
            if (self) return;

            if (Config.LOG_CHAT) {
                this.logChatMessage(tags.username, message);
            }

            if (!message.startsWith('!')) return;

            const args = message.slice(1).split(' ');
            const command = args.shift()?.toLowerCase();

            if (!command) return;

            try {
                await this.handleCommand(tags, command, args);
            }
            catch (e: any) {
                this.logger.error('Failed to handle command', e.message);
            }
        });

        this.io.on('connect', (socket: socketio.Socket) => {
            this.logger.info('Socket connected from', socket.client.conn.remoteAddress);
        });

        this.io.of('/server').on('connect', (socket: socketio.Socket) => {
            // Send spectator (back to) server if possible
            const server = this.state.serverToJoin ?? this.state.currentServer;
            if (server) {
                server.join(this.io);
            }

            socket.on('current', async ({ ip, port, password }: ServerDTO) => {
                const server = this.state.rotationServers.find((s) => {
                    return s.ip == ip && s.port == Number(port) && s.password == password;
                });

                if (server && (!this.state.currentServer?.equals(server) || !this.state.currentServer?.hasSpectatorJoined())) {
                    server.startTimeOnServer();
                    this.state.currentServer = server;
                    this.state.playerRotations.clear();

                    // Unset join server if it is now the current server
                    if (this.state.serverToJoin?.equals(this.state.currentServer)) {
                        this.state.serverToJoin = undefined;
                    }

                    this.logger.info('Current server updated', ip, port);
                }
                else if (!server && this.state.rotationServers.length > 0) {
                    // Server rotation is configured => log warning and send spectator back to expected server (if available)
                    this.logger.warn('Received current server is not in rotation', ip, port);
                    // Whatever we currently think the current server is, it turned out to be wrong => reset it
                    this.state.currentServer = undefined;
                    this.state.playerRotations.clear();
                    // Run server selection to select a server to join if one is not selected already
                    await this.runServerRotationSelection();
                    const expectedServer = this.state.serverToJoin ?? this.state.currentServer;
                    if (expectedServer) {
                        this.logger.warn('Re-issuing join command for expected server', expectedServer.ip, expectedServer.port);
                        expectedServer.join(this.io);
                    }
                }
            });
            
            socket.on('reset', () => {
                if (this.state.currentServer) {
                    this.state.currentServer = undefined;
                    this.state.playerRotations.clear();
                    this.logger.info('Current server reset');
                }
            });
        });

        this.io.of('/game').on('connect', (socket: socketio.Socket) => {
            socket.on('phase', async (dto: GamePhaseDTO) => {
                const { phase } = dto;
                if (phase != this.state.gamePhase) {
                    this.logger.debug('Game phase updated', phase);
                    const previousPhase = this.state.gamePhase;
                    this.state.gamePhase = phase;

                    // Handle any phase-specific actions (will *only* run the phase-specific action)
                    switch (phase) {
                        case 'halted':
                            return await this.handleHaltedPhaseEntered(dto);
                    }

                    // Only run selection when transitioning from the initial or a non-rotation-enabled phase to a
                    // rotation-enabled one, else we might run the selection in very short intervals and/or run it when
                    // spectator is e.g. in menu already joining a server
                    if ((previousPhase == 'initializing' || !isRotationEnabledGamePhase(previousPhase)) && isRotationEnabledGamePhase(phase)) {
                        return await this.handleRotationEnabledPhaseEntered();
                    }
                }
            });
        });

        this.io.of('/player').on('connect', (socket: socketio.Socket) => {
            socket.on('rotate', async () => {
                this.logger.debug('Rotating to next player');
                this.state.playerRotations.push(DateTime.now());
                if (this.state.playerRotations.isFull()) {
                    const averageTimeOnPlayer = this.state.playerRotations.getItems().reduce((acc, val, i, arr) => {
                        if (i + 1 < arr.length) {
                            return acc.plus(val.diff(arr[i + 1]));
                        }
                        return acc;
                    }, Duration.fromMillis(0)).milliseconds / this.state.playerRotations.getSize() / 1000;

                    if (averageTimeOnPlayer < Config.AVERAGE_TIME_ON_PLAYER_THRESHOLD && !this.state.serverToJoin) {
                        this.logger.info(
                            'Average time on player is',
                            averageTimeOnPlayer,
                            'seconds, running server rotation to find (more) active server'
                        );
                        await this.runServerRotationSelection({
                            allSelectable: true,
                            ignoreTimeOnServer: true
                        });
                    }
                    else {
                        this.logger.debug('Average time on player is', averageTimeOnPlayer, 'seconds');
                    }
                }
            });
        });
    }
    
    public addCustomCommandHandlers(): void {
        const customCommands = loadConfig<CustomCommand>('custom-commands.yaml', 'custom-commands.schema.json');
        for (const command of customCommands) {
            this.handlers.push({
                identifier: command.identifier,
                aliases: command.aliases,
                permittedRoles: command.permittedRoles,
                execute: async (client) => {
                    await client.say(Config.SPECTATOR_CHANNEL, command.response);
                }
            });
        }
    }
    
    private removeObsoleteRotationServers(): void {
        const { currentServer, serverToJoin, rotationServers } = this.state;
        this.state.rotationServers = rotationServers.filter((s) => {
            if (s.rotationConfig.temporary && !s.equals(currentServer) && !s.equals(serverToJoin)) {
                this.logger.debug('Removing obsolete temporary rotation server', s.ip, s.port);
                return false;
            }
            return true;
        });
    }

    private selectRotationServer(options: GameServer[], allSelectable = false): GameServer | undefined {
        if (options.length == 0) {
            this.logger.warn('No servers in rotation');
            return;
        }

        if (options.length == 1) {
            const [candidate] = options;
            if (candidate.rotationConfig.ignored) {
                this.logger.warn('Only available rotation server is ignored', candidate.ip, candidate.port);
                return;
            }
            return candidate;
        }

        if (!options.some((s) => s.rotationConfig.fallback)) {
            this.logger.warn('No fallback server(s) configured, rotation server selection may not be possible in some cases');
        }

        const candidates = options
            .filter((s) => {
                if (s.rotationConfig.ignored) {
                    this.logger.warn('Rotation server is ignored and will be excluded from selection', s.ip, s.port);
                    return false;
                }
                return true;
            })
            .map((s) => {
                const score = s.getScore();
                const selectable = s.selectable();
                this.logger.debug(
                    'Current score for rotation server',
                    s.ip,
                    s.port,
                    'is',
                    score,
                    `(${selectable ? 'selectable' : 'not selectable'}${allSelectable && !selectable ? ', overridden to selectable' : ''})`
                );

                return {
                    server: s,
                    score,
                    selectable
                };
            })
            .filter((c) => {
                if (allSelectable) {
                    return true;
                }
                return c.selectable;
            })
            .sort((a, b) => {
                return a.score - b.score;
            })
            .map((c) => c.server);

        return candidates.pop();
    }

    public logChatMessage(username: string | undefined, message: string): void {
        this.chatLogger.setSettings({ requestId: username });
        this.chatLogger.info(message);
    }

    public async run(): Promise<void> {
        this.setupEventListeners();
        this.addCustomCommandHandlers();
        await this.client.connect();

        await this.handleServerStateUpdateTask();
        this.serverStateUpdateTask.start();

        if (this.state.rotationServers.length > 0) {
            await this.handleServerScoreUpdateTask();
            this.serverScoreUpdateTask.start();
        } else {
            this.logger.info('No servers configured, disabling automatic server rotation');
        }

        this.server.listen(Config.LISTEN_PORT, '0.0.0.0', () => {
            this.logger.info('Listening on port', Config.LISTEN_PORT);
        });
    }
}

export default Controller;
