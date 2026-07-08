import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Runs before the test file (and its imports of app.ts/prisma-client.ts) are evaluated,
// so the Prisma client singleton binds to this isolated per-file test database.
const TEST_DB_PATH = path.resolve(__dirname, `../../prisma/test-${crypto.randomBytes(4).toString('hex')}.db`);
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  cwd: path.resolve(__dirname, '../..'),
  env: process.env,
  stdio: 'ignore',
});

afterAll(async () => {
  const { prisma } = await import('../config/prisma-client');
  await prisma.$disconnect();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});
