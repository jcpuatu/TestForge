import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

// Under Jest, `global` persists across test files run sequentially in the same worker
// process, so caching here would leak one test file's PrismaClient (bound to its own
// isolated DATABASE_URL) into the next file's tests. Each test file's module registry
// is otherwise isolated, so simply not caching gives each file its own fresh client.
const isTest = !!process.env.JEST_WORKER_ID;

export const prisma = (!isTest && global.__prisma__) || new PrismaClient();

if (!isTest && process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}
