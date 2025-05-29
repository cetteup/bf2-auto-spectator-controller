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
