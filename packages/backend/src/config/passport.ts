import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { config } from './env.js';
import { UserService } from '../services/UserService.js';

// we'll lazily create UserService when needed
let _userService: UserService | null = null;
function getUserService() {
  if (!_userService) {
    _userService = new UserService();
  }
  return _userService;
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: number, done) => {
  try {
    const userService = getUserService();
    const user = userService.getById(id);
    done(null, user || null);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
    },
    async (accessToken: string, refreshToken: string, profile: Profile, done) => {
      try {
        const userService = getUserService();
        const user = await userService.findOrCreateFromGoogle(profile);
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

export default passport;
