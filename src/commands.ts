import * as socketio from 'socket.io';
import { SpectatorCommand } from './typing';

export type SpectatorCommandDTO = {
    key: SpectatorCommand
    value: boolean
}

export function sendSpectatorCommand(io: socketio.Server, command: SpectatorCommand): boolean {
    return io.emit('command', <SpectatorCommandDTO>{
        key: command,
        value: true
    });
}
