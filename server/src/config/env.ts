import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'file:./prisma/dev.db'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-only-insecure-secret'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@testforge.local',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
};
