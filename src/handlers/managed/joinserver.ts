import { CommandHandler } from '../typing';
import { Role } from '../../permissions';
import * as net from 'net';
import Config from '../../config';
import { isValidPort } from '../../utils';
import { GameServer, Player } from '../../classes';
import { ServerDTO } from '../../typing';
import { handlerLogger } from '../common';

export const joinserver: CommandHandler = {
    command: 'joinserver',
    aliases: ['switchserver'],
    permittedRoles: [Role.Moderator],
    execute: async (io, client, state, args) => {
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
