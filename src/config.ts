import * as path from 'path';
import { Duration } from 'luxon';

export default abstract class Config {
    static readonly ROOT_DIR: string = path.join(__dirname, '..');
    static readonly LISTEN_PORT: number = Number(process.env.PORT || 8181);
    static readonly LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';
    static readonly SPECTATOR_CHANNEL: string = process.env.SPECTATOR_CHANNEL || 'BF2tv';
    static readonly TWITCH_CLIENT_ID?: string = process.env.TWITCH_CLIENT_ID;
    static readonly TWITCH_CLIENT_SECRET?: string = process.env.TWITCH_CLIENT_SECRET;
    static readonly CHATBOT_USERNAME: string = process.env.CHATBOT_USERNAME || '';
    static readonly CHATBOT_OAUTH_ACCESS_TOKEN: string = process.env.CHATBOT_OAUTH_ACCESS_TOKEN || '';
    static readonly CHATBOT_OAUTH_REFRESH_TOKEN?: string = process.env.CHATBOT_OAUTH_REFRESH_TOKEN;
    static readonly SPECTATOR_NAME: string = process.env.SPECTATOR_NAME || 'twitch.tv/BF2tv';
    static readonly DISABLED_COMMANDS: string[] = process.env.DISABLED_COMMANDS?.split(' ') || [];
    static readonly REQUEST_TIMEOUT: number = Number(process.env.REQUEST_TIMEOUT) || 4000;
    static readonly LOG_CHAT: boolean = !!Number(process.env.LOG_CHAT);
    static readonly MINIMUM_TIME_ON_SERVER: Duration = Duration.fromObject({ minutes: Number(process.env.MINIMUM_TIME_ON_SERVER) || 15 });
    static readonly ROTATION_SCORE_SAMPLE_SIZE = Number(process.env.ROTATION_SCORE_SAMPLE_SIZE) || 5;
}
