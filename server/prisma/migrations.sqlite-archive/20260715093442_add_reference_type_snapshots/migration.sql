-- AlterTable
ALTER TABLE "RunCase" ADD COLUMN "referenceLinkSnapshot" TEXT;
ALTER TABLE "RunCase" ADD COLUMN "typeSnapshot" TEXT DEFAULT 'FUNCTIONAL';

-- Backfill: rows that existed before this migration never captured a reference/type snapshot
-- at run-creation time, so the only available approximation is the case's CURRENT
-- referenceLink/type (via caseId) — imperfect for a case edited since, but strictly better than
-- leaving every pre-existing run's data ungrouped/mislabeled. Every RunCase created after this
-- migration gets a true point-in-time snapshot instead (see runs/service.ts).
UPDATE "RunCase"
SET "referenceLinkSnapshot" = (SELECT "referenceLink" FROM "TestCase" WHERE "TestCase"."id" = "RunCase"."caseId"),
    "typeSnapshot" = (SELECT "type" FROM "TestCase" WHERE "TestCase"."id" = "RunCase"."caseId")
WHERE "caseId" IS NOT NULL;
