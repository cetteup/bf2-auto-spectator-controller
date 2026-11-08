import Config from './config';

export type Player = {
    pid: number;
    name: string;
    tag: string;
    score: number;
    kills: number;
    deaths: number;
    ping: number;
    team: number;
    teamLabel: string;
    kind: 'human' | 'aibot' | 'bot' | 'seeder';
};

export function isBot(player: Player): boolean {
    return player.kind !== 'human' || player.name === Config.SPECTATOR_NAME;
}
