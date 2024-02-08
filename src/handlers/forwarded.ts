import * as socketio from 'socket.io';
import * as tmi from 'tmi.js';
import Config from '../config';
import Constants from '../constants';
import { CommandHandler } from './typing';
import { Role } from '../permissions';
import { sendSpectatorCommand } from '../commands';
import { ForwardedSpectatorCommand } from '../typing';

export async function forwardSpectatorCommand(client: tmi.Client, io: socketio.Server, command: ForwardedSpectatorCommand): Promise<void> {
    sendSpectatorCommand(io, command);
    await client.say(Config.SPECTATOR_CHANNEL, Constants.COMMAND_RESPONSES[command]);
}

export const start: CommandHandler = {
    identifier: 'start',
    permittedRoles: [Role.Moderator],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'start');
    }
};

export const stop: CommandHandler = {
    identifier: 'stop',
    permittedRoles: [Role.Moderator],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'stop');
    }
};

export const debug: CommandHandler = {
    identifier: 'debug',
    permittedRoles: [Role.Moderator],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'debug');
    }
};

export const next: CommandHandler = {
    identifier: 'next',
    aliases: ['n', 'skip'],
    permittedRoles: [Role.Viewer],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'next_player');
    }
};

export const respawn: CommandHandler = {
    identifier: 'respawn',
    permittedRoles: [Role.VIP, Role.Moderator],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'respawn');
    }
};

export const rejoin: CommandHandler = {
    identifier: 'rejoin',
    permittedRoles: [Role.VIP, Role.Moderator],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'rejoin');
    }
};

export const restart: CommandHandler = {
    identifier: 'restart',
    permittedRoles: [Role.VIP, Role.Moderator],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'game_restart');
    }
};

export const resume: CommandHandler = {
    identifier: 'resume',
    aliases: ['r', 'unpause'],
    permittedRoles: [Role.Viewer],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'rotation_resume');
    }
};

export const stay: CommandHandler = {
    identifier: 'stay',
    aliases: ['s', 'pause'],
    permittedRoles: [Role.Viewer],
    execute: (client, io) => {
        return forwardSpectatorCommand(client, io, 'rotation_pause');
    }
};
