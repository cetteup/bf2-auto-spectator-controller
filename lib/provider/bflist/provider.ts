import axios from 'axios';
import { Server } from './types';
import { IStateProvider } from '../provider';
import { Query, ServerState } from '../types';

type Deferred<T> = {
    promise: Promise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: unknown) => void
    state: 'pending' | 'fulfilled' | 'rejected'
};

export class StateProvider implements IStateProvider {
    private client: axios.AxiosInstance;

    constructor(timeout: number) {
        this.client = axios.create({
            timeout: timeout
        });
    }

    getStates(queries: Query[]): Promise<ServerState>[] {
        const promises = new Map<string, Deferred<ServerState>>;
        for (const q of queries) {
            let resolve!: (value: ServerState | PromiseLike<ServerState>) => void;
            let reject!: (reason?: unknown) => void;

            const promise = new Promise<ServerState>((res, rej) => {
                resolve = res;
                reject = rej;
            });

            promises.set(q.ip + ':' + q.port, {
                promise,
                resolve,
                reject,
                state: 'pending'
            });
        }

        this.getServers()
            .then((servers) => {
                // Resolve all promises for which we found a matching server
                for (const server of servers) {
                    const promise = promises.get(server.ip + ':' + server.port);
                    if (promise) {
                        promise.resolve({
                            ip: server.ip,
                            port: server.port,
                            name: server.name,
                            numPlayers: server.numPlayers,
                            maxPlayers: server.maxPlayers,
                            mapName: server.mapName,
                            mapSize: server.mapSize,
                            gameType: server.gameType,
                            reservedSlots: server.reservedSlots,
                            noVehicles: server.noVehicles,
                            joinLinkWeb: server.joinLinkWeb ?? undefined,
                            players: server.players.map((p) => ({
                                pid: p.pid,
                                name: p.name,
                                tag: p.tag,
                                score: p.score,
                                kills: p.kills,
                                deaths: p.deaths,
                                ping: p.ping,
                                team: p.team,
                                teamLabel: p.teamLabel,
                                aibot: p.aibot
                            }))
                        });
                        promise.state = 'fulfilled';
                    }
                }

                // Reject any remaining promises
                for (const promise of promises.values()) {
                    if (promise.state == 'pending') {
                        promise.reject(new Error('Server not found'));
                    }
                }
            })
            .catch((e) => {
                // Reject all promises
                for (const promise of promises.values()) {
                    promise.reject(e);
                    promise.state = 'rejected';
                }
            });

        return Array.from(promises.values()).map((p) => p.promise);
    }

    private async getServers(): Promise<Server[]> {
        let cursor: string | undefined;
        let after: string | undefined;
        let hasMore: boolean;
        const servers: Server[] = [];
        do {
            const url = new URL(
                '/v2/bf2/servers',
                'https://api.bflist.io'
            );
            url.searchParams.set('perPage', '100');

            // Add pagination parameters if present
            if (cursor && after) {
                url.searchParams.set('cursor', cursor);
                url.searchParams.set('after', after);
            }

            const resp = await this.client.get<{
                servers: Server[]
                cursor: string
                hasMore: boolean
            }>(url.toString());

            for (const server of resp.data.servers) {
                servers.push(server);
                // Always update marker on the fly (avoids having to pop() later)
                after = server.ip + ':' + server.port;
            }

            cursor = resp.data.cursor;
            hasMore = resp.data.hasMore;
        } while (hasMore);

        return servers;
    }
}
