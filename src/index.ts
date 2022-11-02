import Controller from './controller';
import logger from './logger';

const controller = new Controller();
controller.run()
    .catch((e: any) => logger.error('Failed to launch controller:', e));


