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
    const roles = getRoles(tags);

    for (const role of roles) {
        // Broadcaster is allowed to issue any command
        if (permittedRoles.includes(role) || role == Role.Broadcaster) {
            authLogger.debug(roles, tags.username, 'is authorized to execute', command);
            return true;
        }
    }

    authLogger.warn(...roles, tags.username, 'is not authorized to execute', command);
    return false;
}

function getRoles(tags: tmi.Userstate): Role[] {
    const roles = [Role.Viewer];
    if (tags.badges?.broadcaster) {
        roles.push(Role.Broadcaster);
    }
    if (tags.mod) {
        roles.push(Role.Moderator);
    }
    if (tags.badges?.vip) {
        roles.push(Role.VIP);
    }
    if (tags.subscriber) {
        roles.push(Role.Subscriber);
    }
    return roles;
}
