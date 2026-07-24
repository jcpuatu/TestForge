import { execSync } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Runs before the test file (and its imports of app.ts/prisma-client.ts) are evaluated, so the
// Prisma client singleton binds to this isolated per-file test schema.
//
// Postgres has no per-file-database equivalent to SQLite's old "one .db file per test file"
// isolation, but it does have schemas (namespaces) within one physical database -- the `schema`
// query param on a postgresql:// URL scopes every Prisma operation (including `db push`, which
// auto-creates the schema if missing) to just that namespace. Same isolation guarantee as before
// (each test file gets a completely empty, independent set of tables), just Postgres-native.
const SCHEMA_NAME = `test_${crypto.randomBytes(4).toString('hex')}`;
const baseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/testforge');
baseUrl.searchParams.set('schema', SCHEMA_NAME);
process.env.DATABASE_URL = baseUrl.toString();

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  cwd: path.resolve(__dirname, '../..'),
  env: process.env,
  stdio: 'ignore',
});

afterAll(async () => {
  const { prisma } = await import('../config/prisma-client');
  // No file to unlink anymore -- drop the schema itself so it doesn't linger in the shared
  // Postgres database after the test file finishes.
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA_NAME}" CASCADE`);
  await prisma.$disconnect();
});
