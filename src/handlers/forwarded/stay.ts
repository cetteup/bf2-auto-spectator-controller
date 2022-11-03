import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import { forwardSpectatorCommand } from './common';

export const stay: CommandHandler = {
    command: 'stay',
    aliases: ['pause'],
    permittedRoles: [Role.Viewer, Role.Subscriber, Role.VIP, Role.Moderator],
    execute: (io, client) => {
        return forwardSpectatorCommand(io, client, 'rotation_pause');
    }
};
