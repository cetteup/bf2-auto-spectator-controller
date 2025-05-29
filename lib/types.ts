import { GameServer } from './classes';
import { Role } from './chat/permissions';
import Queue from './queue';
import { DateTime } from 'luxon';
import { GamePhase } from './spectator';

export type ControllerState = {
    rotationServers: GameServer[]
    currentServer?: GameServer
    serverToJoin?: GameServer
    gamePhase: GamePhase
    playerRotations: Queue<DateTime>
}

export type TwitchTokenResponse = {
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string[]
    token_type: string
}

export type CustomCommand = {
    identifier: string
    aliases?: string[]
    permittedRoles: Role[]
    response: string
    description?: string
}

export type ServerConfig = {
    ip: string
    port: number
    password: string | null
    rotationConfig: RotationConfig
}

export type RotationConditionSet = {
    minPlayers?: number
    mapNames?: string[]
    gameTypes?: string[]
    noVehicles?: boolean
}

export type RotationConfig = {
    weight?: number
    minPlayers?: number
    fallback?: boolean
    temporary?: boolean
    ignored?: boolean
    conditions?: RotationConditionSet
}
