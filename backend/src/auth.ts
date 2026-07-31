import { OAuth2Client } from 'google-auth-library';
import { nanoid } from 'nanoid';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { readSessions, readUsers, updateSessions, updateUsers } from './store.js';
import { displayName, type Session, type User } from './types.js';

const googleClient = new OAuth2Client(config.googleClientId);

export interface AuthedRequest extends Request {
  user?: User;
  session?: Session;
}

export async function verifyGoogleIdToken(idToken: string): Promise<{
  googleId: string;
  email: string;
  googleName: string;
  picture: string;
}> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error('Invalid Google token');
  }
  return {
    googleId: payload.sub,
    email: payload.email ?? '',
    googleName: payload.name ?? payload.email ?? 'User',
    picture: payload.picture ?? '',
  };
}

export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string;
  googleName: string;
  picture: string;
}): Promise<User> {
  const now = new Date().toISOString();
  let found: User | undefined;
  await updateUsers((data) => {
    const existing = data.users.find((u) => u.googleId === profile.googleId);
    if (existing) {
      existing.email = profile.email || existing.email;
      existing.googleName = profile.googleName || existing.googleName;
      existing.picture = profile.picture || existing.picture;
      existing.updatedAt = now;
      found = existing;
      return data;
    }
    const user: User = {
      id: nanoid(12),
      googleId: profile.googleId,
      email: profile.email,
      googleName: profile.googleName,
      picture: profile.picture,
      nickname: null,
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(user);
    found = user;
    return data;
  });
  if (!found) throw new Error('Failed to upsert user');
  return found;
}

export async function createSession(userId: string): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: nanoid(32),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.sessionTtlMs).toISOString(),
  };
  await updateSessions((data) => {
    const cutoff = Date.now();
    data.sessions = data.sessions.filter((s) => new Date(s.expiresAt).getTime() > cutoff);
    data.sessions.push(session);
    return data;
  });
  return session;
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(config.cookieName, sessionId, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.sessionTtlMs,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

export async function destroySession(sessionId: string): Promise<void> {
  await updateSessions((data) => {
    data.sessions = data.sessions.filter((s) => s.id !== sessionId);
    return data;
  });
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sid = req.cookies?.[config.cookieName] as string | undefined;
    if (!sid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { sessions } = await readSessions();
    const session = sessions.find((s) => s.id === sid);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { users } = await readUsers();
    const user = users.find((u) => u.id === session.userId);
    if (!user) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    next(err);
  }
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    displayName: displayName(user),
    picture: user.picture,
    nickname: user.nickname,
    googleName: user.googleName,
    email: user.email,
    needsNickname: user.nickname === null,
  };
}
