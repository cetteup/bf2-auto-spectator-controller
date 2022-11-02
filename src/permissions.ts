import * as tmi from 'tmi.js';
import logger from './logger';

const authLogger = logger.getChildLogger({ name: 'AuthLogger' });

export enum Role {
    Viewer = 'viewer',
    Subscriber = 'subscriber',
    VIP = 'vip',
    Moderator = 'moderator',
    Broadcaster = 'broadcaster'
}

export function authorize(tags: tmi.Userstate, permittedRoles: Role[], command: string): boolean {
    const role = getRole(tags);

    // Broadcaster is allowed to issue any command
    if (permittedRoles.includes(role) || role == Role.Broadcaster) {
        authLogger.debug(role, tags.username, 'is authorized to execute', command);
        return true;
    }

    authLogger.warn(role, tags.username, 'is not authorized to execute', command);
    return false;
}

function getRole(tags: tmi.Userstate): Role {
    if (tags.badges?.broadcaster) {
        return Role.Broadcaster;
    }
    if (tags.mod) {
        return Role.Moderator;
    }
    if (tags.badges?.vip) {
        return Role.VIP;
    }
    if (tags.subscriber) {
        return Role.Subscriber;
    }
    return Role.Viewer;
}
