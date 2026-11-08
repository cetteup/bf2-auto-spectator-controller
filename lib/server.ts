import Config from './config';
import logger from './logger';
import { RotationConditionSet, RotationConfig } from './types';
import { DateTime, Duration } from 'luxon';
import * as socketio from 'socket.io';
import Queue from './queue';
import { ServerState } from './provider';
import { sendSpectatorCommand } from './spectator';
import { isBot, Player } from './player';

export class Server {
    public readonly ip: string;
    public readonly port: number;
    public readonly password: string | null;
    public readonly rotationConfig: RotationConfig;

    private state?: ServerState;
    private stateLastUpdatedAt: DateTime | undefined;

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
        const { players, ...rest } = state;
        this.state = {
            players: players.sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)),
            ...rest,
        };
        this.stateLastUpdatedAt = DateTime.now();
    }

    getHumanPlayers(): Array<Player> | undefined {
        return this.state?.players?.filter(player => !isBot(player));
    }

    getBots(): Array<Player> | undefined {
        return this.state?.players?.filter(player => isBot(player));
    }

    getActivePlayers(): Array<Player> | undefined {
        return this.getHumanPlayers()?.filter(player => player.score !== 0 || player.kills !== 0 || player.deaths !== 0);
    }

    getPlayer(name: string): Player | undefined {
        return this.state?.players?.find((p: Player) => p.name == name);
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

    equals(other?: Server): boolean {
        return this.ip == other?.ip && this.port == other.port && this.password == other.password;
    }

    available(): boolean {
        // Temporary servers should never be available as part of the normal rotation
        if (this.rotationConfig.temporary) {
            return false;
        }

        // Don't make server available if state has not recently updated
        if (!this.stateLastUpdatedAt || DateTime.now().diff(this.stateLastUpdatedAt) > Duration.fromObject({ seconds: 30 })) {
            return false;
        }

        return true;
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

        const { mapName, gameType, noVehicles } = this.state ?? {};
        if (conditions.mapNames && mapName && !conditions.mapNames.includes(mapName)) {
            return false;
        }

        if (conditions.gameTypes && gameType && !conditions.gameTypes.includes(gameType)) {
            return false;
        }

        if (conditions.noVehicles !== undefined && noVehicles != conditions.noVehicles) {
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
        return this.scores.getItems().reduce((acc, val) => acc + val, 0) / this.scores.getSize();
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

        const numPlayers = this.state?.players?.length ?? 0;
        const maxPlayers = this.state?.maxPlayers ?? 1;
        const reservedSlots = this.state?.reservedSlots ?? 0;
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
