import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import Config from '../../config';

export const players: CommandHandler = {
    commandNames: ['players'],
    permittedRoles: [Role.Viewer, Role.Subscriber, Role.VIP, Role.Moderator],
    execute: async (io, client, state) => {
        if (!state.currentServer?.initialized) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Spectator is not on a server, player summary is not available');
            return;
        }

        const summary = {
            max: state.currentServer.maxPlayers!,
            online: state.currentServer.players!.length,
            human: state.currentServer.getHumanPlayers()!.length,
            active: state.currentServer.getActivePlayers()!.length,
            bots: state.currentServer.getBots()!.length
        };
        await client.say(Config.SPECTATOR_CHANNEL, `There are currently ${summary.online}/${summary.max} players on the server (${summary.human} humans, of which ${summary.active} are active, and ${summary.bots} bots)`);
    }
};
