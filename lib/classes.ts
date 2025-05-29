import Config from './config';
import logger from './logger';
import { RotationConditionSet, RotationConfig } from './typing';
import { DateTime, Duration } from 'luxon';
import * as socketio from 'socket.io';
import Queue from './queue';
import { sendSpectatorCommand } from './commands';
import { ServerState } from './provider';

export class GameServer {
    ip: string;
    port: number;
    password: string | null;
    rotationConfig: RotationConfig;

    stateLastUpdatedAt: DateTime | undefined;
    name: string | undefined;
    numPlayers: number | undefined;
    maxPlayers: number | undefined;
    mapName: string | undefined;
    mapSize: number | undefined;
    gameType: string | undefined;
    reservedSlots: number | undefined;
    noVehicles: boolean | undefined;
    joinLinkWeb: string | undefined;
    players: Array<Player> | undefined;

    private onServerSince: DateTime | undefined;
    private scores: Queue<number>;

    constructor(ip: string, port: number, password: string | null, rotationConfig: RotationConfig) {
        this.ip = ip;
        this.port = port;
        this.password = password;
        this.rotationConfig = rotationConfig;

        this.scores = new Queue<number>(Config.ROTATION_SCORE_SAMPLE_SIZE);
    }

    updateState(state: ServerState): void {
        this.name = state.name;
        this.numPlayers = state.numPlayers;
        this.maxPlayers = state.maxPlayers;
        this.mapName = state.mapName;
        this.mapSize = state.mapSize;
        this.gameType = state.gameType;
        this.reservedSlots = state.reservedSlots;
        this.noVehicles = state.noVehicles;
        this.joinLinkWeb = state.joinLinkWeb;
        // Add players sorted by score (desc)
        this.players = state.players.map((p) => new Player(p)).sort((a: Player, b: Player) => {
            return b.score - a.score;
        });

        this.stateLastUpdatedAt = DateTime.now();
    }

    getHumanPlayers(): Array<Player> | undefined {
        return this.players?.filter(player => !player.isBot());
    }

    getBots(): Array<Player> | undefined {
        return this.players?.filter(player => player.isBot());
    }

    getActivePlayers(): Array<Player> | undefined {
        return this.getHumanPlayers()?.filter(player => player.score !== 0 || player.kills !== 0 || player.deaths !== 0);
    }

    getPlayer(name: string): Player | undefined {
        return this.players?.find((p: Player) => p.name == name);
    }

    startTimeOnServer(): void {
        this.onServerSince = DateTime.now();
    }

    getTimeOnServer(): Duration | undefined {
        if (!this.onServerSince) {
            return;
        }
        return DateTime.now().diff(this.onServerSince);
    }

    hasSpectatorJoined(): boolean {
        return this.getTimeOnServer() != undefined;
    }

    equals(other?: GameServer): boolean {
        return this.ip == other?.ip && this.port == other.port && this.password == other.password;
    }

    selectable(): boolean {
        // Move legacy minPlayers condition from config to conditions
        if (this.rotationConfig.minPlayers) {
            logger.warn('rotationConfig.minPlayers is deprecated and will be removed in a future release, use rotationConfig.conditions.minPlayers instead', this.ip, this.port);
            this.rotationConfig.conditions = {
                minPlayers: this.rotationConfig.minPlayers,
                ...this.rotationConfig.conditions
            };
            delete this.rotationConfig.minPlayers;
        }

        // Fallback should *always* be selectable
        if (this.rotationConfig.fallback) {
            return true;
        }

        // Temporary servers should never be selectable as part of the normal rotation
        if (this.rotationConfig.temporary) {
            return false;
        }

        // Don't make server selectable if state has not recently updated
        if (!this.stateLastUpdatedAt || DateTime.now().diff(this.stateLastUpdatedAt) > Duration.fromObject({ seconds: 30 })) {
            return false;
        }

        // Don't make server selectable if rolling score average has not reached the desired sample size yet
        if (!this.scores.isFull()) {
            return false;
        }

        return this.matchesConditions(this.rotationConfig.conditions);
    }

    private matchesConditions(conditions: RotationConditionSet | undefined): boolean {
        if (!conditions) {
            return true;
        }

        const humanPlayers = this.getHumanPlayers()?.length ?? 0;
        const minPlayers = conditions.minPlayers ?? 0;
        if (humanPlayers < minPlayers) {
            return false;
        }

        if (conditions.mapNames && this.mapName && !conditions.mapNames.includes(this.mapName)) {
            return false;
        }

        if (conditions.gameTypes && this.gameType && !conditions.gameTypes.includes(this.gameType)) {
            return false;
        }

        if (conditions.noVehicles !== undefined && this.noVehicles != conditions.noVehicles) {
            return false;
        }

        return true;
    }

    updateScore(): void {
        const weight = this.rotationConfig.weight ?? 1.0;
        const currentScore = this.computeBaseScore() * weight * this.computeFreeSlotPenalty();

        // Calculate score based on a rolling average of scores
        // (avoids switching servers shortly after a server crashes or many players get kicked/leave after a round end/map change)
        this.scores.push(currentScore);
    }

    getScore(): number {
        return this.scores.getItems().reduce((acc, val) => acc +  val, 0) / this.scores.getSize();
    }

    private computeBaseScore(): number {
        const humanPlayers = this.getHumanPlayers()?.length ?? 0;
        const activePlayers = this.getActivePlayers()?.length ?? 0;

        return (1 - Config.ACTIVE_PLAYER_SCORE_RATIO) * humanPlayers + Config.ACTIVE_PLAYER_SCORE_RATIO * activePlayers;
    }

    /*
    Computes a (potential) penalty for few free slots on the server.
    As slots past the configured threshold are taken up,
    the penalty decreases in value and thus increases in effect.

    1 <= penalty <= Config.MAX_FREE_SLOT_PENALTY, 1 meaning no penalty.
     */
    private computeFreeSlotPenalty(): number {
        if (Config.FREE_SLOT_SCORE_PENALTY_THRESHOLD >= 1) {
            // Return 1 = no penalty if penalty threshold is 100% server fill rate
            return 1;
        }

        const numPlayers = this.numPlayers ?? 0;
        const maxPlayers = this.maxPlayers ?? 1;
        const reservedSlots = this.reservedSlots ?? 0;
        const penalty = (maxPlayers - numPlayers - reservedSlots) / ((1 - Config.FREE_SLOT_SCORE_PENALTY_THRESHOLD) * maxPlayers);

        // Limit value range to
        // a) not apply any positive score effect if server has many free slots
        // b) keep score from being reduced to 0 if there are no free slots
        return Math.min(1, Math.max(penalty, Config.MAX_FREE_SLOT_PENALTY));
    }
    
    join(io: socketio.Server): void {
        // Reset timestamp to ensure that we don't count time spent previously on a server when re-joining
        this.onServerSince = undefined;
        sendSpectatorCommand(io, 'join', {
            ip: this.ip,
            port: this.port.toString(),
            password: this.password
        });
    }
}

export class Player {
    pid: number;
    name: string;
    tag: string;
    score: number;
    kills: number;
    deaths: number;
    ping: number;
    team: number;
    teamLabel: string;
    aibot: boolean;

    constructor({ pid, name, tag, score, kills, deaths, ping, team, teamLabel, aibot }: {
        pid: number,
        name: string,
        tag: string,
        score: number,
        kills: number,
        deaths: number,
        ping: number,
        team: number,
        teamLabel: string,
        aibot: boolean
    }) {
        this.pid = pid;
        this.name = name;
        this.tag = tag;
        this.score = score;
        this.kills = kills;
        this.deaths = deaths;
        this.ping = ping;
        this.team = team;
        this.teamLabel = teamLabel;
        this.aibot = aibot;
    }

    isBot(): boolean {
        return this.aibot || this.name === Config.SPECTATOR_NAME || !(this.ping > 0 || this.score !== 0 || this.kills !== 0 || this.deaths !== 0);
    }
}
