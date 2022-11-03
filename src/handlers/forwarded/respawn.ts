import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import { forwardSpectatorCommand } from './common';

export const respawn: CommandHandler = {
    command: 'respawn',
    permittedRoles: [Role.VIP, Role.Moderator],
    execute: (io, client) => {
        return forwardSpectatorCommand(io, client, 'respawn');
    }
};
