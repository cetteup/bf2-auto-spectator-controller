import { CommandHandler } from './typing';
import { Role } from '../permissions';
import * as net from 'net';
import Config from '../config';
import { formatDuration, isValidPort } from '../utils';
import { GameServer } from '../classes';
import { handlerLogger } from './common';

export const joinserver: CommandHandler = {
    identifier: 'joinserver',
    aliases: ['switchserver'],
    permittedRoles: [Role.Moderator],
    execute: async (client, io, state, args) => {
        const [ip, port, password] = args;

        if (!net.isIPv4(ip) || !isValidPort(Number(port))) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Usage: !joinserver [ip] [port] [[password]]');
            return;
        }

        const serverToJoin = new GameServer(ip, Number(port), password, {
            temporary: true
        });
        const onCurrentServer = !!state.currentServer?.getPlayer(Config.SPECTATOR_NAME);

        // Update join server if given ip, port or password differs from current server or spectator is not actually on the server
        let response;
        if (!serverToJoin.equals(state.currentServer) || !onCurrentServer) {
            response = 'Spectator will join server shortly';

            // Avoid adding multiple rotation entries for a single server => use server from list if possible
            const rotationServer = state.rotationServers.find((s) => s.equals(serverToJoin));
            if (rotationServer) {
                if (rotationServer.rotationConfig.ignored) {
                    handlerLogger.info('Join server is a currently ignored rotation server, removing ignored flag');
                    rotationServer.rotationConfig.ignored = false;
                }
                state.serverToJoin = rotationServer;
            }
            else {
                state.serverToJoin = serverToJoin;
                state.rotationServers.push(serverToJoin);
            }

            handlerLogger.info('Join server updated', state.serverToJoin.ip, state.serverToJoin.port);

            state.serverToJoin.join(io);
        } else {
            response = 'Spectator is already on requested server';
        }
        await client.say(Config.SPECTATOR_CHANNEL, response);
    }
};

export const ignore: CommandHandler = {
    identifier: 'ignore',
    permittedRoles: [Role.Moderator],
    execute: async (client, io, state, args) => {
        const [ip, port] = args;

        if (!net.isIPv4(ip) || !isValidPort(Number(port))) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Usage: !ignore [ip] [port]');
            return;
        }

        const server = state.rotationServers.find((s) => s.ip == ip && s.port == Number(port));
        if (!server) {
            await client.say(Config.SPECTATOR_CHANNEL, 'I cannot ignore what don\'t know. No such server in the rotation.');
            return;
        }
        if (server.rotationConfig.ignored) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Reading yesterdays paper again? Already ignoring the server.');
            return;
        }

        handlerLogger.info('Setting ignored flag on server', server.ip, server.port);
        server.rotationConfig.ignored = true;
        await client.say(Config.SPECTATOR_CHANNEL, '10-4. Server added to the naughty list.');
    }
};

export const notice: CommandHandler = {
    identifier: 'notice',
    permittedRoles: [Role.Moderator],
    execute: async (client, io, state, args) => {
        const [ip, port] = args;

        if (!net.isIPv4(ip) || !isValidPort(Number(port))) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Usage: !notice [ip] [port]');
            return;
        }

        const server = state.rotationServers.find((s) => s.ip == ip && s.port == Number(port));
        if (!server) {
            await client.say(Config.SPECTATOR_CHANNEL, 'How can I notice what does not exist?. No such server in the rotation.');
            return;
        }
        if (!server.rotationConfig.ignored) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Um, I am not ignoring that server');
            return;
        }

        handlerLogger.info('Removing ignored flag from server', server.ip, server.port);
        server.rotationConfig.ignored = false;
        await client.say(Config.SPECTATOR_CHANNEL, 'I feel like I have seen that server before. Glad it\'s back!');
    }
};

export const server: CommandHandler = {
    identifier: 'server',
    aliases: ['currentserver'],
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.hasSpectatorJoined()) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `Currently spectating on: ${state.currentServer.name} - bf2.tv/servers/${state.currentServer.ip}:${state.currentServer.port}`);
    }
};

export const since: CommandHandler = {
    identifier: 'since',
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.hasSpectatorJoined()) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `Joined current server ${formatDuration(state.currentServer!.getTimeOnServer()!)} ago`);
    }
};

export const join: CommandHandler = {
    identifier: 'join',
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.hasSpectatorJoined()) {
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
    identifier: 'players',
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.hasSpectatorJoined()) {
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
    identifier: 'top',
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state, args) => {
        if (!state.currentServer?.hasSpectatorJoined()) {
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
    identifier: 'map',
    aliases: ['currentmap'],
    permittedRoles: [Role.Viewer],
    execute: async (client, io, state) => {
        if (!state.currentServer?.hasSpectatorJoined()) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Whoops, spectator is not on a server');
            return;
        }
        await client.say(Config.SPECTATOR_CHANNEL, `The current map is: ${state.currentServer.mapName} (${state.currentServer.mapSize})`);
    }
};

export const team: CommandHandler = {
    identifier: 'team',
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
