import compression from 'compression';
import express from 'express';
import { body, query, validationResult } from 'express-validator';
import * as cron from 'node-cron';
import { CommandStore, GameServer } from './classes';
import { Config } from './config';
import Constants from './constants';


const app = express();
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Init server vars
let currentServer: GameServer|undefined;
let serverToJoin: GameServer|undefined;

// Init command vars
const commands = new CommandStore();

app.post('/servers/current', [
    body('app_key').equals(Config.APP_KEY),
    body('ip').isIP(),
    body('port').isPort().toInt(),
    body('password').matches(/^[a-zA-Z0-9_-]*$/).withMessage('Password contains illegal characters'),
    body('in_rotation').isBoolean().toBoolean(),
    validateInputs
], async (req: express.Request, res: express.Response) => {
    // Update server if not yet defined or given ip/port differ
    if (currentServer === undefined || req.body.ip !== currentServer.ip || req.body.port !== currentServer.gamePort) {
        currentServer = new GameServer(req.body.ip, req.body.port, req.body.password, req.body.in_rotation);
        // Trigger initial state update
        currentServer.updateState();

        // Unset join server if it is now the current server
        if (currentServer.ip === serverToJoin?.ip && currentServer.gamePort === serverToJoin?.gamePort) {
            serverToJoin = undefined;
        }
    }
	
    // Send response
    res.json({
        message: 'Updated current server succesfully',
        server: {
            ip: currentServer.ip,
            port: currentServer.gamePort
        }
    });
    console.log('Current server updated');
});

app.post('/servers/join', [
    body('app_key').equals(Config.APP_KEY),
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
app.get('/servers/join-chatbot', [
    query('app_key').equals(Config.APP_KEY),
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

app.get('/servers/current', (req: express.Request, res: express.Response) => {
    if (currentServer !== undefined) {
        res.json(currentServer);
    } else {
        res.status(404).send('No servers have been added/specator not on any server');
    }
});

app.get('/servers/current/players/total', (req: express.Request, res: express.Response) => {
    if (currentServer?.initialized) {
        res.send(`${currentServer.players?.length}/${currentServer.maxPlayers}`);
    } else {
        res.status(404).send('No servers have been added/specator not on any server');
    }
});

app.get('/servers/current/players/summary', async (req: express.Request, res: express.Response) => {
    if (currentServer?.initialized) {
        res.json({
            max: currentServer.maxPlayers,
            online: currentServer.players?.length,
            human: currentServer.getHumanPlayers()?.length,
            active: currentServer.getActivePlayers()?.length,
            bots: currentServer.getBots()?.length
        });
    } else {
        res.status(404).send('No servers have been added/specator not on any server');
    }
});

app.get('/servers/current/players/top', [
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
                const text = `#${String(index + 1).padStart(indexPadTo, '0')}: ${player.tag.padEnd(tagPadTo, ' ')}${player.name}`;
                // Add space after dots so tags/names will not show up as links 
                return text.replace('.', '. ');
            });
            res.send(rankings?.join(' - '));
        } else {
            res.json(players);
        }
    } else {
        res.status(404).send('No servers have been added/specator not on any server');
    }
});

app.get('/servers/join', (req: express.Request, res: express.Response) => {
    if (serverToJoin !== undefined) {
        // Only send server details required to join it
        res.json({
            ip: serverToJoin.ip,
            gamePort: serverToJoin.gamePort,
            password: serverToJoin.password,
            inRotation: serverToJoin.inRotation
        });
    } else {
        res.status(404).send('No servers have been added/no server to join');
    }
});

app.post('/commands', [
    body('app_key').equals(Config.APP_KEY),
    validateInputs
], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Transfer given commands from request body
    res.locals = {
        ...res.locals,
        givenCommands: req.body
    };
    next();
}, saveValidCommands);

// Allow chatbots to send commands via HTTP GET
app.get('/commands-chatbot', [
    query('app_key').equals(Config.APP_KEY),
    validateInputs
], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Transfer given commands from request query
    res.locals = {
        ...res.locals,
        givenCommands: req.query
    };
    next();
}, saveValidCommands);

app.get('/commands', [
    query('app_key').equals(Config.APP_KEY),
    validateInputs
], (req: express.Request, res: express.Response) => {
    res.json(commands);
});

function validateInputs(req: express.Request, res: express.Response, next: express.NextFunction) {
    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }
    next();
}

function setJoinServer(req: express.Request, res: express.Response) {
    // Add game server
    const gameServer = new GameServer(res.locals.ip, res.locals.port, res.locals.password, false);

    // Update join server if given ip or port differs from current server
    let message;
    if (gameServer.ip !== currentServer?.ip || gameServer.gamePort !== currentServer?.gamePort) {
        message = 'Specator will join server shortly';
        serverToJoin = gameServer;
    } else {
        message = 'Spectator is already on requested server';
    }

    // Send response
    res.json({
        message: message,
        server: {
            ip: gameServer.ip,
            port: gameServer.gamePort
        }
    });
}

function saveValidCommands(req: express.Request, res: express.Response) {
    const commandsToCopy = Object.keys(res.locals.givenCommands).filter((key) => Object.keys(commands).includes(String(key).toLowerCase()));
    // Copy values to global commands store
    for (const key of commandsToCopy) {
        let value = res.locals.givenCommands[key];
        const desiredType = typeof commands[key as keyof typeof commands];
        if (typeof value != desiredType) {
            switch (desiredType) {
                case 'boolean':
                    value = !!Number(value);
                    break;
            }
        }
        commands[key as keyof typeof commands] = value;
    }

    if (Object.keys(commandsToCopy).length > 0) {
        // Use command specific response if only one command is given and specific response is available
        let message: string;
        if (commandsToCopy.length == 1 && commandsToCopy[0] in Constants.COMMAND_RESPONSES) {
            message = Constants.COMMAND_RESPONSES[commandsToCopy[0]];
        }
        else {
            message = 'Commands updated successfully';
        }

        res.json({
            message: message,
            commands: Object.fromEntries(commandsToCopy.map((key) => [key, commands[key as keyof typeof commands]]))
        });
    } else {
        res.status(400).send('No valid commands specified');
    }
    return ;
}

// Update current server's state every 20 seconds
// (bflist updates at 00, 20 and 40, so get fresh data at 10, 30 and 50)
cron.schedule('10,30,50 * * * * *', () => {
    if (currentServer !== undefined) {
        console.log('Updating game server state');
        currentServer.updateState();
    }
});

app.listen(Config.LISTEN_PORT, () => {
    console.log('Listening on port', Config.LISTEN_PORT);
});
