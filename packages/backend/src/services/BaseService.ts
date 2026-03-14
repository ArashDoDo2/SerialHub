import { logger } from '../config/logger.js';

export abstract class BaseService {
  protected logger = logger.child({ service: this.constructor.name });
}