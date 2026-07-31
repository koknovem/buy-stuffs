import { Router } from 'express';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  requireAuth,
  setSessionCookie,
  toPublicUser,
  upsertGoogleUser,
  verifyGoogleIdToken,
  type AuthedRequest,
} from '../auth.js';

export const authRouter = Router();

authRouter.post('/google', async (req, res, next) => {
  try {
    const idToken = String(req.body?.idToken ?? req.body?.credential ?? '');
    if (!idToken) {
      res.status(400).json({ error: 'idToken required' });
      return;
    }
    const profile = await verifyGoogleIdToken(idToken);
    const user = await upsertGoogleUser(profile);
    const session = await createSession(user.id);
    setSessionCookie(res, session.id);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.session) await destroySession(req.session.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
