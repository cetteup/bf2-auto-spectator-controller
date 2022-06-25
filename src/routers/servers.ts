import { body, query } from 'express-validator';
import express from 'express';
import { GameServer, Player } from '../classes';
import logger from '../logger';
import { validateInputs } from './utils';
import Config from '../config';

const serversRouter = express.Router();
const routerLogger = logger.getChildLogger({ name: 'ServersRouterLogger' });

// Init server vars
let currentServer: GameServer | undefined;
let serverToJoin: GameServer | undefined;

serversRouter.post('/current', [
    body('ip').isIP(),
    body('port').isPort().toInt(),
    body('password').matches(/^[a-zA-Z0-9_-]*$/).withMessage('Password contains illegal characters'),
    body('in_rotation').isBoolean().toBoolean(),
    validateInputs
], async (req: express.Request, res: express.Response) => {
    // Update server if not yet defined or given ip/port differ
    if (currentServer === undefined || req.body.ip !== currentServer.ip || req.body.port !== currentServer.port) {
        currentServer = new GameServer(req.body.ip, req.body.port, req.body.password, req.body.in_rotation);
        // Trigger initial state update
        currentServer.updateState();

        // Unset join server if it is now the current server
        if (currentServer.ip === serverToJoin?.ip && currentServer.port === serverToJoin?.port) {
            serverToJoin = undefined;
        }

        routerLogger.info('Current server updated', currentServer.ip, currentServer.port);
    }
    // Send response
    res.json({
        message: 'Updated current server succesfully',
        server: {
            ip: currentServer.ip,
            port: currentServer.port
        }
    });
});

serversRouter.post('/join', [
    body('ip').isIP(),
    body('port').isPort().toInt(),
    body('password').matches(/^[a-zA-Z0-9_-]*$/).withMessage('Password contains illegal characters'),
    validateInputs,
], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Transfer server details
    res.locals = {
        ...res.locals,
        ip: req.body.ip,
        port: req.body.port,
        password: req.body.password
    };
    next();
}, setJoinServer);

// Allow Moobot to send a join server request via HTTP GET
serversRouter.get('/join-chatbot', [
    query('ip').isIP(),
    query('port').isPort().toInt(),
    query('password').matches(/^[a-zA-Z0-9_-]*$/).withMessage('Password contains illegal characters'),
    validateInputs
], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Transfer server details
    res.locals = {
        ...res.locals,
        ip: req.query.ip,
        port: req.query.port,
        password: req.query.password
    };
    next();
}, setJoinServer);

serversRouter.get('/current', (req: express.Request, res: express.Response) => {
    if (currentServer !== undefined) {
        res.json(currentServer);
    } else {
        res.status(404).send('No servers have been added/spectator not on any server');
    }
});

serversRouter.get('/current/players/total', (req: express.Request, res: express.Response) => {
    if (currentServer?.initialized) {
        res.send(`${currentServer.players?.length}/${currentServer.maxPlayers}`);
    } else {
        res.status(404).send('No servers have been added/spectator not on any server');
    }
});

serversRouter.get('/current/players/summary', async (req: express.Request, res: express.Response) => {
    if (currentServer?.initialized) {
        res.json({
            max: currentServer.maxPlayers,
            online: currentServer.players?.length,
            human: currentServer.getHumanPlayers()?.length,
            active: currentServer.getActivePlayers()?.length,
            bots: currentServer.getBots()?.length
        });
    } else {
        res.status(404).send('No servers have been added/spectator not on any server');
    }
});

serversRouter.get('/current/players/top', [
    query('count').toInt().customSanitizer(value => {
        if (value >= 1 && value <= 10) {
            return value;
        } else {
            return 3;
        }
    }),
    query('as_text').toBoolean(),
], (req: express.Request, res: express.Response) => {
    if (currentServer?.initialized) {
        // Get the top n slice of players
        const players = currentServer.players?.slice(0, Number(req.query.count));

        // Send text of json response
        if (req.query.as_text) {
            // Determine number to pad up to
            const indexPadTo = String(req.query.count).length;
            // Build text message (format: #[padded index/place]: [player name])
            const rankings = players?.map((player, index) => {
                // Determine whether to add space after player tag (no space if no tag)
                const tagPadTo = player.tag.length > 0 ? player.tag.length + 1 : 0;
                return `#${String(index + 1).padStart(indexPadTo, '0')}: ${player.tag.padEnd(tagPadTo, ' ')}${player.name} [${player.teamLabel}]`;
            });
            res.send(rankings?.join(' - '));
        } else {
            res.json(players);
        }
    } else {
        res.status(404).send('No servers have been added/spectator not on any server');
    }
});

serversRouter.get('/join', (req: express.Request, res: express.Response) => {
    if (serverToJoin !== undefined) {
        // Only send server details required to join it
        res.json({
            ip: serverToJoin.ip,
            gamePort: serverToJoin.port,
            password: serverToJoin.password,
            inRotation: serverToJoin.inRotation
        });
    } else {
        res.status(404).send('No servers have been added/no server to join');
    }
});

function setJoinServer(req: express.Request, res: express.Response) {
    // Add game server
    const gameServer = new GameServer(res.locals.ip, res.locals.port, res.locals.password, false);

    const onCurrentServer = currentServer?.players?.some((p: Player) => p.name == Config.SPECTATOR_NAME);

    // Update join server if given ip, port or password differs from current server or spectator is not actually on the server
    let message;
    if (gameServer.ip != currentServer?.ip || gameServer.port != currentServer?.port || gameServer.password != currentServer.password || !onCurrentServer) {
        message = 'Spectator will join server shortly';
        serverToJoin = gameServer;

        routerLogger.info('Join server updated', gameServer.ip, gameServer.port);
    } else {
        message = 'Spectator is already on requested server';
    }

    // Send response
    res.json({
        message: message,
        server: {
            ip: gameServer.ip,
            port: gameServer.port
        }
    });
}

export default serversRouter;
export { currentServer };
