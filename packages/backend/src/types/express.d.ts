import type { User as AppUser } from '../repositories/UserRepository.js';

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}
