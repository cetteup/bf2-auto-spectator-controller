import express from 'express';
import logger from '../logger';
import Constants from '../constants';
import { CommandStore } from '../typing';

const commandsRouter = express.Router();
const routerLogger = logger.getChildLogger({ name: 'CommandsRouterLogger' });

// Init command vars
const commands: CommandStore = {
    game_restart: false,
    rotation_pause: false,
    rotation_resume: false,
    next_player: false,
    respawn: false
};

commandsRouter.post('/', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Transfer given commands from request body
    res.locals = {
        ...res.locals,
        givenCommands: req.body
    };
    next();
}, saveValidCommands);

// Allow chatbots to send commands via HTTP GET
commandsRouter.get('/chatbot', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Transfer given commands from request query
    res.locals = {
        ...res.locals,
        givenCommands: req.query
    };
    next();
}, saveValidCommands);

commandsRouter.get('/', (req: express.Request, res: express.Response) => {
    res.json(commands);
});

function saveValidCommands(req: express.Request, res: express.Response) {
    // Copy values of valid commands to global commands store
    const copiedCommands: string[] = [];
    for (const key in res.locals.givenCommands) {
        if (key in commands) {
            let value = res.locals.givenCommands[key];
            const desiredType = typeof commands[key];
            if (typeof value != desiredType) {
                switch (desiredType) {
                    case 'boolean':
                        value = !!Number(value);
                        break;
                }
            }
            routerLogger.debug('Storing valid command', key, value);
            commands[key] = value;
            copiedCommands.push(key);
        }
        else {
            routerLogger.debug('Ignoring invalid command', key, res.locals.givenCommands[key]);
        }
    }

    if (copiedCommands.length > 0) {
        // Use command specific response if only one command is given and specific response is available
        let message: string;
        if (copiedCommands.length == 1 && copiedCommands[0] in Constants.COMMAND_RESPONSES) {
            message = Constants.COMMAND_RESPONSES[copiedCommands[0]];
        }
        else {
            message = 'Commands updated successfully';
        }

        res.json({
            message: message,
            commands: Object.fromEntries(copiedCommands.map((key) => [key, commands[key]]))
        });
    } else {
        res.status(400).send('No valid commands specified');
    }
}

export default commandsRouter;
