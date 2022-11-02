import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import { forwardSpectatorCommand } from './common';

export const restart: CommandHandler = {
    commandNames: ['restart'],
    permittedRoles: [Role.VIP, Role.Moderator],
    execute: (io, client) => {
        return forwardSpectatorCommand(io, client, 'game_restart');
    }
};
