// One-off data migration helper (SQLite -> Postgres provider swap, see root CLAUDE.md's Roadmap).
// Reads the JSON dump produced by export-sqlite-data.ts and inserts every row into the CURRENT
// (postgres-provider) database, in FK-dependency order. Run AFTER schema.prisma's
// datasource.provider has been switched to "postgresql", the fresh baseline migration has been
// applied, and `prisma generate` has been re-run against the new provider.
//
// Usage: npx tsx scripts/import-postgres-data.ts

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Parent-before-child order -- required this time (unlike the exporter, where order was
// cosmetic), since these are real FK-constrained inserts.
const MODELS = [
  'user', 'refreshToken', 'apiKey',
  'project', 'configGroup', 'config', 'label', 'sharedStepSet',
  'suite', 'section', 'testCase', 'testCaseLabel', 'testCaseSharedSteps',
  'milestone', 'testPlan', 'testRun', 'runCase', 'result', 'attachment',
  'webhook', 'webhookDelivery', 'auditLog',
] as const;

// Section and Milestone self-relate via parentId (onDelete: Restrict) -- inserting a child before
// its parent exists would violate the FK. Rather than topologically sorting by tree depth, insert
// every row of these two models with parentId temporarily stripped, then a second pass sets the
// real parentId back once every row (parent or child) already exists.
const SELF_RELATING = new Set(['section', 'milestone']);

async function main() {
  const dumpPath = path.resolve(__dirname, '../prisma/sqlite-export.json');
  const dump: Record<string, Record<string, unknown>[]> = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));

  for (const model of MODELS) {
    const rows = dump[model] ?? [];
    if (rows.length === 0) {
      console.log(`${model}: 0 rows, skipped`);
      continue;
    }

    if (SELF_RELATING.has(model)) {
      const firstPass = rows.map((r) => ({ ...r, parentId: null }));
      // @ts-expect-error dynamic model access -- MODELS is kept in sync with schema.prisma by hand
      await prisma[model].createMany({ data: firstPass });
      const withParent = rows.filter((r) => r.parentId);
      for (const r of withParent) {
        // @ts-expect-error dynamic model access
        await prisma[model].update({ where: { id: r.id }, data: { parentId: r.parentId } });
      }
      console.log(`${model}: ${rows.length} rows (2-pass, ${withParent.length} parented)`);
      continue;
    }

    // @ts-expect-error dynamic model access
    await prisma[model].createMany({ data: rows });
    console.log(`${model}: ${rows.length} rows`);
  }

  console.log('\nImport complete.');
}

main()
  .catch((err) => {
    console.error('IMPORT FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
