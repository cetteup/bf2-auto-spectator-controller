import * as socketio from 'socket.io';
import { ServerDTO, SpectatorCommand, SpectatorCommandDTO } from './typing';

export function sendSpectatorCommand(io: socketio.Server, command: Exclude<SpectatorCommand, 'join'>): boolean
export function sendSpectatorCommand(io: socketio.Server, command: Extract<SpectatorCommand, 'join'>, server: ServerDTO): boolean

export function sendSpectatorCommand(io: socketio.Server, command: SpectatorCommand, args?: unknown): boolean {
    return io.emit('command', <SpectatorCommandDTO>{
        command,
        args: args ?? true
    });
}
