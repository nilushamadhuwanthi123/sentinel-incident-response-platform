import 'dotenv/config';

const parseOrigins = (raw) =>
  (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 4000,
  env: process.env.NODE_ENV ?? 'development',
  // No wildcard fallback: an origin has to be named, in development as well
  // as production, so a deployment that forgets CORS_ORIGINS fails loudly
  // rather than quietly accepting every origin on the internet.
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS) || [],
  mongoUri: process.env.MONGODB_URI ?? '',
};

export const hasDatabase = () => Boolean(config.mongoUri);
