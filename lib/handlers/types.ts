import * as socketio from 'socket.io';
import * as tmi from 'tmi.js';
import { Role } from '../permissions';
import { ControllerState } from '../types';

export type CommandHandler = {
    identifier: string
    aliases?: string[]
    permittedRoles: Role[]
    execute: (client: tmi.Client, io: socketio.Server, state: ControllerState, args: string[]) => Promise<void>
}
