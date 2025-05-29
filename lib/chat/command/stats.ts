import { CommandHandler } from './types';
import { Role } from '../permissions';
import Config from '../../config';
import axios from 'axios';
import { handlerLogger } from './logger';

function buildStatbitsURL(game: string, source: string, platform: string, playerName: string, endpoint: string): string {
    // Encode all (potentially) user-provided strings
    const [ g, p, n ] = [ game, platform, playerName ].map((s) => encodeURIComponent(s));
    const url = new URL(
        `/chatmsg/${g}/${source}/${p}/players/${n}/${endpoint}`,
        'https://api.statbits.io'
    );
    url.searchParams.set('forceOk', '1');
    return url.toString();
}

export const stats: CommandHandler = {
    identifier: 'stats',
    permittedRoles: [ Role.Viewer ],
    execute: async (client, io, state, args) => {
        const [ playerName, game, platform ] = args;

        if (!playerName) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Usage: !stats [player name] [[game]] [[platform]]');
            return;
        }

        // Bad Company, 1943 and Bad Company 2 only have the archive source left
        // https://statbits.io/changelog/#december-9-2023
        let source;
        if ([ 'bfbc', 'bf1943', 'bfbc2' ].includes(game)) {
            source = 'archive';
        } else {
            source = 'stats';
        }

        let response: string;
        try {
            const url = buildStatbitsURL(
                game ?? 'bf2',
                source,
                platform ?? 'bf2hub',
                playerName,
                'summary-short-a'
            );
            const resp = await axios.get(url, {
                timeout: Config.REQUEST_TIMEOUT
            });
            response = resp.data;
        } catch (error) {
            handlerLogger.error('Failed to player stats summary for', playerName, game, platform, error instanceof Error ? error.message : error);
            response = `Sorry, failed to fetch stats for ${playerName}`;
        }

        await client.say(Config.SPECTATOR_CHANNEL, response);
    }
};

export const summary: CommandHandler = {
    identifier: 'summary',
    aliases: [ 'livestats', 'rndstats' ],
    permittedRoles: [ Role.Viewer ],
    execute: async (client, io, state, args) => {
        const [ playerName ] = args;

        if (!playerName) {
            await client.say(Config.SPECTATOR_CHANNEL, 'Usage: !summary [player name]');
            return;
        }

        let response: string;
        try {
            const url = buildStatbitsURL(
                'bf2',
                'live',
                'pc',
                playerName,
                'summary'
            );
            const resp = await axios.get(url, {
                timeout: Config.REQUEST_TIMEOUT
            });
            response = resp.data;
        } catch (error) {
            handlerLogger.error('Failed to player stats summary for', playerName, error instanceof Error ? error.message : error);
            response = `Sorry, failed to fetch live stats for ${playerName}`;
        }

        await client.say(Config.SPECTATOR_CHANNEL, response);
    }
};

type BflistLivestatsDTO = {
    servers: number
    players: number
}

export const active: CommandHandler = {
    identifier: 'active',
    aliases: [ 'dead' ],
    permittedRoles: [ Role.Viewer ],
    execute: async (client) => {
        let response: string;
        try {
            const url = new URL(
                '/bf2/v1/livestats',
                'https://api.bflist.io'
            );
            const resp = await axios.get(url.toString(), {
                timeout: Config.REQUEST_TIMEOUT
            });
            const livestats = resp.data as BflistLivestatsDTO;
            response = `Battlefield 2 is still active. Right now, ${livestats.players} players are playing it online.`;
        } catch (error) {
            handlerLogger.error('Failed to fetch live concurrent player stats', error instanceof Error ? error.message : error);
            response = 'Sorry, failed to fetch live concurrent player stats';
        }

        await client.say(Config.SPECTATOR_CHANNEL, response);
    }
};
