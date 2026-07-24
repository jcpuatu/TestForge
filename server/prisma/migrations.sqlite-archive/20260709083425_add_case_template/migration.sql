-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RunCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "caseId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "templateSnapshot" TEXT NOT NULL DEFAULT 'TEXT',
    "stepsSnapshot" TEXT,
    "expectedSnapshot" TEXT,
    "missionSnapshot" TEXT,
    "goalsSnapshot" TEXT,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNTESTED',
    "assignedToId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RunCase_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RunCase_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RunCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RunCase" ("assignedToId", "caseId", "createdAt", "expectedSnapshot", "id", "orderIndex", "priority", "runId", "status", "stepsSnapshot", "titleSnapshot", "updatedAt") SELECT "assignedToId", "caseId", "createdAt", "expectedSnapshot", "id", "orderIndex", "priority", "runId", "status", "stepsSnapshot", "titleSnapshot", "updatedAt" FROM "RunCase";
DROP TABLE "RunCase";
ALTER TABLE "new_RunCase" RENAME TO "RunCase";
CREATE INDEX "RunCase_runId_idx" ON "RunCase"("runId");
CREATE INDEX "RunCase_assignedToId_idx" ON "RunCase"("assignedToId");
CREATE UNIQUE INDEX "RunCase_runId_caseId_key" ON "RunCase"("runId", "caseId");
CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suiteId" TEXT NOT NULL,
    "sectionId" TEXT,
    "title" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'TEXT',
    "preconditions" TEXT,
    "steps" TEXT,
    "expectedResult" TEXT,
    "mission" TEXT,
    "goals" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "type" TEXT NOT NULL DEFAULT 'FUNCTIONAL',
    "estimate" TEXT,
    "referenceLink" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCase_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("createdAt", "createdById", "estimate", "expectedResult", "id", "isDeleted", "orderIndex", "preconditions", "priority", "referenceLink", "sectionId", "steps", "suiteId", "title", "type", "updatedAt") SELECT "createdAt", "createdById", "estimate", "expectedResult", "id", "isDeleted", "orderIndex", "preconditions", "priority", "referenceLink", "sectionId", "steps", "suiteId", "title", "type", "updatedAt" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE INDEX "TestCase_suiteId_idx" ON "TestCase"("suiteId");
CREATE INDEX "TestCase_sectionId_idx" ON "TestCase"("sectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: every row that existed before this migration was authored under the old
-- always-per-line-steps form (today's STEPS template shape), not the new TEXT default —
-- relabel them so existing case/run content keeps rendering as multi-step lists instead of
-- collapsing to a single freeform paragraph.
UPDATE "TestCase" SET "template" = 'STEPS';
UPDATE "RunCase" SET "templateSnapshot" = 'STEPS';
