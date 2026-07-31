import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(env('PORT', '7001')),
  dataDir: path.resolve(env('DATA_DIR', path.join(__dirname, '../../data'))),
  sessionSecret: env('SESSION_SECRET', 'dev-session-secret-change-me'),
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:7000'),
  googleClientId: env(
    'GOOGLE_CLIENT_ID',
    '609978039700-l77di8avqomg63jss0hbsdp1ssg1114a.apps.googleusercontent.com',
  ),
  googleClientSecret: env('GOOGLE_CLIENT_SECRET'),
  publicAppUrl: env('PUBLIC_APP_URL', 'https://buy.brian-li.com').replace(/\/$/, ''),
  deepseekApiKey: env('DEEPSEEK_API_KEY'),
  deepseekBaseUrl: env('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').replace(/\/$/, ''),
  deepseekModel: env('DEEPSEEK_MODEL', 'deepseek-v4-flash'),
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  cookieName: 'buy_stuffs_sid',
};
