import axios from 'axios';
import Config from './config';
import logger from './logger';
import { RotationConfig, ServerDTO } from './typing';
import { DateTime, Duration } from 'luxon';
import * as socketio from 'socket.io';

export class GameServer {
    ip: string;
    port: number;
    password: string | null;
    rotationConfig: RotationConfig;

    stateLastUpdatedAt: DateTime | undefined;
    name: string | undefined;
    mapName: string | undefined;
    mapSize: number | undefined;
    maxPlayers: number | undefined;
    joinLinkWeb: string | undefined;
    players: Array<Player> | undefined;

    onServerSince: DateTime | undefined;

    constructor(ip: string, port: number, password: string | null, rotationConfig: RotationConfig) {
        this.ip = ip;
        this.port = port;
        this.password = password;
        this.rotationConfig = rotationConfig;
    }

    async updateState(): Promise<void> {
        try {
            const resp = await axios.get(`https://api.bflist.io/bf2/v1/servers/${this.ip}:${this.port}`);
            const state = resp.data;
            this.name = state.name;
            this.mapName = state.mapName;
            this.mapSize = state.mapSize;
            this.maxPlayers = state.maxPlayers;
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

    equals(other?: GameServer): boolean {
        return this.ip == other?.ip && this.port == other.port && this.password == other.password;
    }

    selectable(): boolean {
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

        const humanPlayers = this.getHumanPlayers()?.length ?? 0;
        const minPlayers = this.rotationConfig.minPlayers ?? 0;
        return humanPlayers >= minPlayers;
    }

    score(): number {
        const humanPlayers = this.getHumanPlayers()?.length ?? 0;
        const weight = this.rotationConfig.weight ?? 1.0;
        return humanPlayers * weight;
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
