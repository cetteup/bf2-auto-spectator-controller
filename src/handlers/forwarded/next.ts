import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import { forwardSpectatorCommand } from './common';

export const next: CommandHandler = {
    commandNames: ['next', 'skip'],
    permittedRoles: [Role.Viewer, Role.Subscriber, Role.VIP, Role.Moderator],
    execute: (io, client) => {
        return forwardSpectatorCommand(io, client, 'next_player');
    }
};