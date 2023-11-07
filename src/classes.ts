import axios from 'axios';
import Config from './config';
import logger from './logger';
import { RotationConditionSet, RotationConfig, ServerDTO } from './typing';
import { DateTime, Duration } from 'luxon';
import * as socketio from 'socket.io';
import Queue from './queue';

export class GameServer {
    ip: string;
    port: number;
    password: string | null;
    rotationConfig: RotationConfig;

    stateLastUpdatedAt: DateTime | undefined;
    name: string | undefined;
    maxPlayers: number | undefined;
    mapName: string | undefined;
    mapSize: number | undefined;
    gameType: string | undefined;
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

    async updateState(): Promise<void> {
        try {
            const resp = await axios.get(`https://api.bflist.io/bf2/v1/servers/${this.ip}:${this.port}`);
            const state = resp.data;
            this.name = state.name;
            this.maxPlayers = state.maxPlayers;
            this.mapName = state.mapName;
            this.mapSize = state.mapSize;
            this.gameType = state.gameType;
            this.noVehicles = state.noVehicles;
            this.joinLinkWeb = state.joinLinkWeb;
            // Add players sorted by score (desc)
            this.players = state.players.map((player: IPlayer) => new Player(player)).sort((a: Player, b: Player) => {
                return b.score - a.score;
            });

            this.stateLastUpdatedAt = DateTime.now();
        }
        catch(e: any) {
            logger.error('Failed to update game server state', e.message, this.ip, this.port);
        }
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
        // Copy legacy minPlayers condition from config to conditions
        if (this.rotationConfig.minPlayers) {
            logger.warn('rotationConfig.minPlayers is deprecated and will be removed in a future release, use rotationConfig.conditions.minPlayers instead', this.ip, this.port);
            this.rotationConfig.conditions = {
                minPlayers: this.rotationConfig.minPlayers,
                ...this.rotationConfig.conditions
            };
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

        if (conditions.noVehicles && this.noVehicles != conditions.noVehicles) {
            return false;
        }

        return true;
    }

    score(): number {
        const humanPlayers = this.getHumanPlayers()?.length ?? 0;
        const activePlayers = this.getActivePlayers()?.length ?? 0;
        const weight = this.rotationConfig.weight ?? 1.0;
        const currentScore = ((1 - Config.ACTIVE_PLAYER_SCORE_RATIO) * humanPlayers + Config.ACTIVE_PLAYER_SCORE_RATIO * activePlayers) * weight;

        // Calculate score based on a rolling average of scores
        // (avoids switching servers shortly after a server crashes or many players get kicked/leave after a round end/map change)
        this.scores.push(currentScore);
        return this.scores.getItems().reduce((acc, val) => acc +  val, 0) / this.scores.getSize();
    }
    
    join(io: socketio.Server): void {
        // Reset timestamp to ensure that we don't count time spent previously on a server when re-joining
        this.onServerSince = undefined;
        io.of('/server').emit('join', <ServerDTO>{
            ip: this.ip,
            port: this.port.toString(),
            password: this.password
        });
    }
}

interface IPlayer {
    pid: number;
    name: string;
    tag: string;
    score: number;
    kills: number;
    deaths: number;
    ping: number;
    teamIndex: number;
    teamLabel: string;
    aibot: boolean;
}

export class Player implements IPlayer {
    pid: number;
    name: string;
    tag: string;
    score: number;
    kills: number;
    deaths: number;
    ping: number;
    teamIndex: number;
    teamLabel: string;
    aibot: boolean;

    constructor({ pid, name, tag, score, kills, deaths, ping, teamIndex, teamLabel, aibot }: IPlayer) {
        this.pid = pid;
        this.name = name;
        this.tag = tag;
        this.score = score;
        this.kills = kills;
        this.deaths = deaths;
        this.ping = ping;
        this.teamIndex = teamIndex;
        this.teamLabel = teamLabel;
        this.aibot = aibot;
    }

    isBot(): boolean {
        return this.aibot || this.name === Config.SPECTATOR_NAME || !(this.ping > 0 || this.score !== 0 || this.kills !== 0 || this.deaths !== 0);
    }
}
