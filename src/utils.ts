import axios from 'axios';
import Config from './config';

export function isValidPort(port: number): boolean {
    return port > 0 && port < 65536;
}

export async function isAccessTokenValid(accessToken: string): Promise<boolean> {
    try {
        await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-Id': Config.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        return true;
    }
    catch (e) {
        return false;
    }
}

export function formatOAuthPassword(accessToken: string) {
    return `oauth:${accessToken}`;
}
