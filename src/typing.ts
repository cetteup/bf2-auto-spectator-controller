import { GameServer } from './classes';
import { Role } from './permissions';

export type SpectatorCommand = 'start' | 'stop' | 'debug' | 'game_restart' | 'rotation_pause' | 'rotation_resume' | 'next_player' | 'respawn' | 'rejoin'

export type ForwardCommandDTO = {
    key: SpectatorCommand
    value: boolean
}

export type ServerDTO = {
    ip: string
    port: string
    password: string | null
}

export type GamePhase =
    'initializing'
    | 'launching'
    | 'in-menu'
    | 'loading'
    | 'spawning'
    | 'spectating'
    | 'between-rounds'
    | 'closing'
    | 'starting'
    | 'stopping'
    | 'stopped'
    | 'halted'

export type ControllerState = {
    rotationServers: GameServer[]
    currentServer?: GameServer
    serverToJoin?: GameServer
    gamePhase: GamePhase
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
    conditions?: RotationConditionSet
}
