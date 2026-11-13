import { Controller, StateProvider } from '../lib';
import Config from '../lib/config';
import logger from '../lib/logger';

const provider = new StateProvider(Config.REQUEST_TIMEOUT);
const controller = new Controller(provider);
controller.run()
    .catch((error) => {
        if (error instanceof Error) {
            error = error.message;
        }
        logger.fatal(error);
    });


