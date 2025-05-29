import { GameServer } from './classes';
import { Role } from './permissions';
import Queue from './queue';
import { DateTime } from 'luxon';

export type SpectatorCommand =
    'start'
    | 'stop'
    | 'release'
    | 'debug'
    | 'game_restart'
    | 'rotation_pause'
    | 'rotation_resume'
    | 'next_player'
    | 'respawn'
    | 'join'
    | 'rejoin'

export type ForwardedSpectatorCommand = Exclude<SpectatorCommand, 'release' | 'join'>

export type SpectatorCommandDTO = {
    command: SpectatorCommand
    args: unknown
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

export type NoDataPhaseDTO = {
    phase: Exclude<GamePhase, 'halted'>
}

export type HaltedPhaseDTO = {
    phase: 'halted'
    server: ServerDTO
}

export type GamePhaseDTO = NoDataPhaseDTO | HaltedPhaseDTO

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
