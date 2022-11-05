import { CommandHandler } from './typing';
import { Role } from '../permissions';
import * as net from 'net';
import Config from '../config';
import { isValidPort } from '../utils';
import { GameServer } from '../classes';
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
        const onCurrentServer = !!state.currentServer?.getPlayer(Config.SPECTATOR_NAME);

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

export const server: CommandHandler = {
    command: 'server',
    aliases: ['currentserver'],
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.initialized) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `Currently spectating on: ${state.currentServer.name} - bf2.tv/servers/${state.currentServer.ip}:${state.currentServer.port}`);
    }
};

export const join: CommandHandler = {
    command: 'join',
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.initialized) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        if (!state.currentServer.joinLinkWeb) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Sorry, current server is not supported by joinme.click');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `Join the action with two clicks: ${state.currentServer.joinLinkWeb}`);
    }
};

export const players: CommandHandler = {
    command: 'players',
    permittedRoles: [Role.Viewer],
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
    permittedRoles: [Role.Viewer],
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

export const map: CommandHandler = {
    command: 'map',
    aliases: ['currentmap'],
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.initialized) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `The current map is: ${state.currentServer.mapName} (${state.currentServer.mapSize})`);
    }
};

export const team: CommandHandler = {
    command: 'team',
    aliases: ['currentteam'],
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        const team = state.currentServer?.getPlayer(Config.SPECTATOR_NAME)?.teamLabel;
        if (!team) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `Currently spectating the ${team} team`);
    }
};
