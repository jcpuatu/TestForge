// One-off data migration helper (SQLite -> Postgres provider swap, see root CLAUDE.md's Roadmap).
// Dumps every row from the CURRENT (sqlite-provider) database to a JSON file, read-only —
// the source dev.db is never modified. Run BEFORE switching schema.prisma's datasource.provider
// to "postgresql", since this script's PrismaClient is generated against whichever provider is
// currently configured.
//
// Usage: npx tsx scripts/export-sqlite-data.ts

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Export order doesn't need to be dependency-safe (it's just a snapshot read), but keeping it
// parent-before-child here anyway since the SAME order is reused by the importer, where it does
// matter for foreign keys.
const MODELS = [
  'user', 'refreshToken', 'apiKey',
  'project', 'configGroup', 'config', 'label', 'sharedStepSet',
  'suite', 'section', 'testCase', 'testCaseLabel', 'testCaseSharedSteps',
  'milestone', 'testPlan', 'testRun', 'runCase', 'result', 'attachment',
  'webhook', 'webhookDelivery', 'auditLog',
] as const;

async function main() {
  const dump: Record<string, unknown[]> = {};
  for (const model of MODELS) {
    // @ts-expect-error dynamic model access -- MODELS is kept in sync with schema.prisma by hand
    const rows = await prisma[model].findMany();
    dump[model] = rows;
    console.log(`${model}: ${rows.length} rows`);
  }

  const outPath = path.resolve(__dirname, '../prisma/sqlite-export.json');
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main()
  .catch((err) => {
    console.error('EXPORT FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
