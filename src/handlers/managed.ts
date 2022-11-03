import { CommandHandler } from './typing';
import { Role } from '../permissions';
import * as net from 'net';
import Config from '../config';
import { isValidPort } from '../utils';
import { GameServer, Player } from '../classes';
import { ServerDTO } from '../typing';
import { handlerLogger } from './common';

export const joinserver: CommandHandler = {
    command: 'joinserver',
    aliases: ['switchserver'],
    permittedRoles: [Role.Moderator],
    execute: async (client, io, state, args) => {
        const [ip, port, password] = args;

        if (!net.isIPv4(ip) || !isValidPort(Number(port))) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Usage: !joinserver [ip] [port] [[password]]');
            return;
        }

        const server = new GameServer(ip, Number(port), password, false);
        const onCurrentServer = state.currentServer?.players?.some((p: Player) => p.name == Config.SPECTATOR_NAME);

        // Update join server if given ip, port or password differs from current server or spectator is not actually on the server
        let response;
        if (server.ip != state.currentServer?.ip || server.port != state.currentServer?.port || server.password != state.currentServer.password || !onCurrentServer) {
            response = 'Spectator will join server shortly';
            state.serverToJoin = server;

            handlerLogger.info('Join server updated', server.ip, server.port);

            io.of('/server').emit('join', <ServerDTO>{
                ip: server.ip,
                port: server.port.toString(),
                password: server.password
            });
        } else {
            response = 'Spectator is already on requested server';
        }
        await client.say(Config.SPECTATOR_CHANNEL, response);
    }
};

export const players: CommandHandler = {
    command: 'players',
    permittedRoles: [Role.Viewer, Role.Subscriber, Role.VIP, Role.Moderator],
    execute: async (client, io, state) => {
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

export const top: CommandHandler = {
    command: 'top',
    permittedRoles: [Role.Viewer, Role.Subscriber, Role.VIP, Role.Moderator],
    execute: async (client, io, state, args) => {
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