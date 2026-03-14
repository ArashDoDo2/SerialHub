import { server, logger } from './app.js';
import { config } from './config/env.js';

server.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});