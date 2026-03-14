import { UserRepository, User } from '../repositories/UserRepository.js';
import { config } from '../config/env.js';

export class UserService {
  private repo = new UserRepository();

  async findOrCreateFromGoogle(profile: any): Promise<User> {
    const googleId = profile.id;
    let user = this.repo.findByGoogleId(googleId);
    if (!user) {
      user = this.repo.create({
        googleId,
        email: profile.emails?.[0]?.value,
        name: profile.displayName || profile.name?.givenName || '',
        avatarUrl: profile.photos?.[0]?.value,
        role: 'user',
      });
    }
    return user;
  }

  getById(id: number): User | undefined {
    return this.repo.findById(id);
  }

  findOrCreateLocalMaster(): User {
    const existing = this.repo.findByEmail(config.localAuth.email);
    if (existing) {
      if (existing.role !== 'admin' || existing.name !== config.localAuth.name) {
        return this.repo.update(existing.id, {
          name: config.localAuth.name,
          role: 'admin',
        })!;
      }
      return existing;
    }

    return this.repo.create({
      googleId: `local:${config.localAuth.email}`,
      email: config.localAuth.email,
      name: config.localAuth.name,
      role: 'admin',
    });
  }
}
