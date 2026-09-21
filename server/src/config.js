import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

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

export const config = {
  port: Number(process.env.PORT) || 4000,
  env: process.env.NODE_ENV ?? 'development',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS) || ['http://localhost:5173'],
  mongoUri: process.env.MONGODB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET || 'sentinel-platform-defensive-jwt-secret-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
};

export const hasDatabase = () => Boolean(config.mongoUri);
