import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { initStore } from './store.js';
import { authRouter } from './routes/auth.js';
import { ingredientsRouter, tripsRouter } from './routes/trips.js';
import { requireAuth, toPublicUser, type AuthedRequest } from './auth.js';
import { updateUsers } from './store.js';

async function main() {
  await initStore();

  const app = express();
  app.set('trust proxy', 1);

  const allowedOrigins = new Set([
    config.corsOrigin,
    'https://buy.brian-li.com',
    'http://localhost:7000',
    'http://127.0.0.1:7000',
  ]);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowedOrigins.has(origin)) cb(null, true);
        else cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);

  app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: toPublicUser(req.user!) });
  });

  app.patch('/api/me', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const nicknameRaw = req.body?.nickname;
      let nickname: string | null;
      if (nicknameRaw === null || nicknameRaw === undefined) {
        nickname = null;
      } else {
        nickname = String(nicknameRaw).trim().slice(0, 40);
        if (!nickname) nickname = null;
      }
      let updated = req.user!;
      await updateUsers((data) => {
        const user = data.users.find((u) => u.id === req.user!.id);
        if (!user) return data;
        user.nickname = nickname;
        user.updatedAt = new Date().toISOString();
        updated = user;
        return data;
      });
      res.json({ user: toPublicUser(updated) });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/trips', tripsRouter);
  app.use('/api/ingredients', ingredientsRouter);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  app.listen(config.port, () => {
    console.log(`buy-stuffs api on :${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
