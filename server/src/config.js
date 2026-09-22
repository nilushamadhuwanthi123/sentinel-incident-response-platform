import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Look for .env in current directory or project root
const currentEnv = path.resolve(process.cwd(), '.env');
const parentEnv = path.resolve(process.cwd(), '../.env');

if (fs.existsSync(currentEnv)) {
  dotenv.config({ path: currentEnv });
} else if (fs.existsSync(parentEnv)) {
  dotenv.config({ path: parentEnv });
} else {
  dotenv.config();
}

const parseOrigins = (raw) =>
  (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

// A missing JWT_SECRET in production would silently sign every session with
// whatever the fallback happened to be -- effectively no authentication at
// all, since anyone who read this file could forge a valid token. Refusing
// to start is safer than running open.
//
// In development the fallback is generated fresh per process start (never a
// fixed string baked into source) so it is never a knowable secret, at the
// cost of invalidating existing sessions on every restart -- an acceptable
// trade for local development.
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start in production with no signing secret.'
    );
  }

  console.warn(
    '[sentinel] JWT_SECRET is not set -- generating a random development-only secret. ' +
      'Every server restart invalidates existing sessions. Set JWT_SECRET for a stable value.'
  );
  return crypto.randomBytes(48).toString('hex');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  env: process.env.NODE_ENV ?? 'development',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS) || ['http://localhost:5173'],
  mongoUri: process.env.MONGODB_URI ?? '',
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
};

export const hasDatabase = () => Boolean(config.mongoUri);
