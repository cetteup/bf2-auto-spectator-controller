import compression from 'compression';
import express from 'express';
import * as cron from 'node-cron';
import Config from './config';
import logger, { asyncLocalStorage } from './logger';
import { customAlphabet } from 'nanoid';
import serversRouter, { currentServer } from './routers/servers';
import commandsRouter from './routers/commands';

const app = express();
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging setup middleware
app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requestId: string = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 6)();
    await asyncLocalStorage.run({ requestId },  async () => {
        return next();
    });
});

// Auth middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Auth header or "app_key" query param should contain the configured app key
    if (req.get('APP_KEY') != Config.APP_KEY && req.query.app_key != Config.APP_KEY) {
        return res.status(403).send('No valid app key provided');
    }
    next();
});

app.use('/servers', serversRouter);
app.use('/commands', commandsRouter);

// Update current server's state every 20 seconds
// (bflist updates at 00, 20 and 40, so get fresh data at 10, 30 and 50)
cron.schedule('10,30,50 * * * * *', () => {
    if (currentServer != undefined) {
        logger.debug('Updating game server state', currentServer.ip, currentServer.port);
        currentServer.updateState();
    }
});

app.listen(Config.LISTEN_PORT, () => {
    logger.info('Listening on port', Config.LISTEN_PORT);
});
