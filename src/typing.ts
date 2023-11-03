import { GameServer } from './classes';
import { Role } from './permissions';

export type SpectatorCommand = 'start' | 'stop' | 'game_restart' | 'rotation_pause' | 'rotation_resume' | 'next_player' | 'respawn' | 'rejoin'

export type ForwardCommandDTO = {
    key: SpectatorCommand
    value: boolean
}

export type ServerDTO = {
    ip: string
    port: string
    password?: string
}

export type ControllerState = {
    currentServer?: GameServer
    serverToJoin?: GameServer
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
