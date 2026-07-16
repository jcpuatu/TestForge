import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

// Unlike required() above, a secret's fallback must never silently apply outside local dev — a
// deployment that forgot to set JWT_ACCESS_SECRET should fail to start, not sign every token
// with a hardcoded, publicly-visible-in-source-control value.
function requiredSecret(name: string, devOnlyFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Missing required environment variable: ${name} — no insecure fallback is allowed when NODE_ENV=production`);
  }
  return devOnlyFallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'file:./prisma/dev.db'),
  jwtAccessSecret: requiredSecret('JWT_ACCESS_SECRET', 'dev-only-insecure-secret'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // Only defaults to insecure when neither COOKIE_SECURE nor NODE_ENV says otherwise — an
  // explicit COOKIE_SECURE always wins either direction; an unset one defaults secure in
  // production (refresh cookies must be HTTPS-only there) and insecure in local dev (no HTTPS).
  cookieSecure: process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : isProduction,
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@testforge.local',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
};
