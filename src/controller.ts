import * as socketio from 'socket.io';
import * as tmi from 'tmi.js';
import * as http from 'http';
import Config from './config';
import logger from './logger';
import { CommandHandler } from './handlers/typing';
import { authorize } from './permissions';
import { ControllerState, ServerDTO } from './typing';
import { joinserver } from './handlers/managed/joinserver';
import { GameServer } from './classes';
import { next } from './handlers/forwarded/next';
import { respawn } from './handlers/forwarded/respawn';
import { restart } from './handlers/forwarded/restart';
import { resume } from './handlers/forwarded/resume';
import { stay } from './handlers/forwarded/stay';
import { Logger } from 'tslog';
import * as cron from 'node-cron';
import { players } from './handlers/managed/players';
import { top } from './handlers/managed/top';

class Controller {
    private logger: Logger;

    private readonly server: http.Server;
    private readonly io: socketio.Server;
    private readonly client: tmi.Client;

    private handlers: CommandHandler[];

    private readonly state: ControllerState;

    private serverStateUpdateTask: cron.ScheduledTask;

    constructor() {
        this.logger = logger.getChildLogger({ name: 'ControllerLogger' });

        this.server = http.createServer();
        this.io = new socketio.Server(this.server);
        this.client = new tmi.Client({
            connection: { reconnect: true },
            identity: {
                username: Config.CHATBOT_USERNAME,
                password: `oauth:${Config.CHATBOT_OAUTH_TOKEN}`
            },
            channels: [Config.SPECTATOR_CHANNEL],
            options: {
                messagesLogLevel: 'debug'
            },
            logger: this.logger.getChildLogger({ name: 'tmiLogger' })
        });

        this.handlers = [next, respawn, restart, resume, stay, joinserver, players, top];

        this.state = {};

        // Update current server's state every 20 seconds
        // (bflist updates at 00, 20 and 40, so get fresh data at 10, 30 and 50)
        this.serverStateUpdateTask = cron.schedule('10,30,50 * * * * *', () => {
            if (this.state.currentServer) {
                logger.debug('Updating game server state', this.state.currentServer.ip, this.state.currentServer.port);
                this.state.currentServer.updateState();
            }
        }, {
            scheduled: false
        });
    }

    private async handleCommand(tags: tmi.Userstate, command: string, args: string[]): Promise<void> {
        const handler = this.handlers.find((c) => c.commandNames.includes(command));

        if (!handler) return;

        this.logger.info(tags.username, 'issued command', command, ...args);

        if (!authorize(tags, handler.permittedRoles, command)) return;

        return handler.execute(this.io, this.client, this.state, args);
    }

    private setupEventListeners(): void {
        this.client.on('message', async (channel: string, tags: tmi.Userstate, message: string, self: boolean) => {
            if (self || !message.startsWith('!')) return;

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
                socket.emit('join', <ServerDTO>{
                    ip: server.ip,
                    port: server.port.toString(),
                    password: server.password
                });
            }

            socket.on('current', ({ ip, port, password }: ServerDTO) => {
                if (!this.state.currentServer || ip != this.state.currentServer.ip || Number(port) != this.state.currentServer.port || password != this.state.currentServer.password) {
                    this.state.currentServer = new GameServer(ip, Number(port), password);
                    this.state.currentServer.updateState();

                    // Unset join server if it is now the current server
                    if (this.state.currentServer.ip == this.state.serverToJoin?.ip && this.state.currentServer.port == this.state.serverToJoin?.port) {
                        this.state.serverToJoin = undefined;
                    }

                    this.logger.info('Current server updated', ip, port);
                }
            });
        });
    }

    public async run(): Promise<void> {
        this.setupEventListeners();
        await this.client.connect();
        this.serverStateUpdateTask.start();
        this.server.listen(Config.LISTEN_PORT, '0.0.0.0', () => {
            this.logger.info('Listening on port', Config.LISTEN_PORT);
        });
    }
}

export default Controller;
