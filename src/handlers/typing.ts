import * as socketio from 'socket.io';
import * as tmi from 'tmi.js';
import { Role } from '../permissions';
import { ControllerState } from '../typing';

export type CommandHandler = {
    command: string
    aliases?: string[]
    permittedRoles: Role[]
    execute: (io: socketio.Server, client: tmi.Client, state: ControllerState, args: string[]) => Promise<void>
}
