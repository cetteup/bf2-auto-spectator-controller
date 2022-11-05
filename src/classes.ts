import axios from 'axios';
import Config from './config';
import logger from './logger';

export class GameServer {
    ip: string;
    port: number;
    password: string | null;
    inRotation: boolean;

    initialized = false;
    name: string | undefined;
    map: string | undefined;
    maxPlayers: number | undefined;
    joinLinkWeb: string | undefined;
    players: Array<Player> | undefined;

    constructor(ip: string, port: number, password: string | null = null, inRotation = false) {
        this.ip = ip;
        this.port = port;
        this.password = password;
        this.inRotation = inRotation;
    }

    updateState(): void {
        axios.get(`https://api.bflist.io/bf2/v1/servers/${this.ip}:${this.port}`)
            .then((response) => {
                const state = response.data;
                this.name = state.name;
                this.map = state.map;
                this.maxPlayers = state.maxPlayers;
                this.joinLinkWeb = state.joinLinkWeb;
                // Add players sorted by score (desc)
                this.players = state.players.map((player: IPlayer) => new Player(player)).sort((a: Player, b: Player) => {
                    return b.score - a.score;
                });
                // Mark server as initialized if this is the initial successful update
                if (!this.initialized) this.initialized = true;
            }).catch((error) => {
                logger.error('Failed to update game server state', error.message, this.ip, this.port);
            });
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
