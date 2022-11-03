import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import Config from '../../config';

export const top: CommandHandler = {
    command: 'top',
    permittedRoles: [Role.Viewer, Role.Subscriber, Role.VIP, Role.Moderator],
    execute: async (io, client, state, args) => {
        if (!state.currentServer?.initialized) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Spectator is not on a server, top players are not available');
            return;
        }

        const count = Number(args.shift());
        const sanitized = count >= 1 && count <= 10 ? count : 3;

        // Get the top n slice of players
        const players = state.currentServer.players!.slice(0, sanitized);

        // Build text message (format: #[index/place]: [player name])
        const rankings = players.map((player, index) => {
            // Determine whether to add space after player tag (no space if no tag)
            const tagPadTo = player.tag.length > 0 ? player.tag.length + 1 : 0;
            return `#${String(index + 1)}: ${player.tag.padEnd(tagPadTo, ' ')}${player.name} [${player.teamLabel}]`;
        });
        await client.say(Config.SPECTATOR_CHANNEL, rankings.join(', '));
    }
};
