import { Query, ServerState } from './types';

export interface IStateProvider {
    // Runs all queries, returning a promise for each (wrapped in a "global" promise).
    // Order of returned promises is guaranteed to match order of queries.
    getStates(queries: Query[]): Promise<ServerState>[];
}
