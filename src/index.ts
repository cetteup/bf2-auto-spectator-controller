import Controller from './controller';
import logger from './logger';
import { StateProvider } from './provider/bflist/provider';
import Config from './config';

const provider = new StateProvider(Config.REQUEST_TIMEOUT);
const controller = new Controller(provider);
controller.run()
    .catch((e: any) => logger.error('Failed to launch controller:', e));


