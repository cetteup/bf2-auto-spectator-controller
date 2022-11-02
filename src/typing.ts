import { GameServer } from './classes';

export type SpectatorCommand = 'game_restart' | 'rotation_pause' | 'rotation_resume' | 'next_player' | 'respawn'

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
