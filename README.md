# Buy Stuffs

Mobile web app for shared dinner ingredient trips: invite codes / QR, claim & bought states, Google login, and server-side DeepSeek buy-list generation.

## Ports

| Service | Port |
|---------|------|
| Web (nginx / Vite) | **7000** |
| API | **7001** |
| Reserved | 7002–7005 |

Production host: `https://buy.brian-li.com` → reverse proxy to port **7000** (nginx proxies `/api` to the API container).

## Quick start (local)

```bash
cp .env.example .env
# fill GOOGLE_CLIENT_SECRET, SESSION_SECRET, DEEPSEEK_API_KEY
# Production: COOKIE_SECURE=true, CORS_ORIGIN=https://buy.brian-li.com, PUBLIC_APP_URL=https://buy.brian-li.com
# Local: COOKIE_SECURE=false, CORS_ORIGIN=http://localhost:7000, PUBLIC_APP_URL=http://localhost:7000

cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Or with Docker:

```bash
cp .env.example .env
# edit .env for production or local docker values
docker compose up --build -d
```

JSON data lives in `./data` (mounted into the API container).

## Google OAuth

- Authorized JavaScript origin: `https://buy.brian-li.com` (and `http://localhost:7000` for local)
- Redirect URI: `https://buy.brian-li.com/redirect`
- Client ID is public (also `VITE_GOOGLE_CLIENT_ID`); **client secret stays in `.env` only**

Minimal profile: Google account + optional nickname (skip → Google display name).

## DeepSeek

Server-only: `POST /api/trips/:id/dishes/generate` with dish name.

```
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

## Jenkins

1. Pipeline / Multibranch job using root `Jenkinsfile`
2. Secret file credential id: **`buy-stuffs-dotenv`** (production `.env`), or set `BUY_STUFFS_ENV_FILE`
3. Optional: `BUY_STUFFS_HEALTH_HOST=host.docker.internal` if Jenkins runs in Docker
4. Health check: `http://<host>:7001/api/health`

Keep `./data` (or a host bind mount) across deploys so trips are not wiped.

## Ingredient actions

- Tap open item → **claim** (your avatar shows)
- Tap your claimed item → **bought**
- Long-press / context menu on your claim → **release**
