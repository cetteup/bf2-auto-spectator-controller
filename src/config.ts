import * as path from 'path';

export class Config {
    static readonly ROOT_DIR: string = path.join(__dirname, '..');
    static readonly LISTEN_PORT: number = Number(process.env.PORT || 8181);
    static readonly APP_KEY: string = process.env.APP_KEY || 'PleaseSetAnAppKey';
    static readonly SPECTATOR_NAME: string = process.env.SPECTATOR_NAME || 'allidoisspectate';
}
