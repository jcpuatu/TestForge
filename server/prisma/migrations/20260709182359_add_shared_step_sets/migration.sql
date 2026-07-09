-- CreateTable
CREATE TABLE "SharedStepSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SharedStepSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCaseSharedSteps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "sharedStepSetId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TestCaseSharedSteps_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCaseSharedSteps_sharedStepSetId_fkey" FOREIGN KEY ("sharedStepSetId") REFERENCES "SharedStepSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SharedStepSet_projectId_idx" ON "SharedStepSet"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedStepSet_projectId_name_key" ON "SharedStepSet"("projectId", "name");

-- CreateIndex
CREATE INDEX "TestCaseSharedSteps_caseId_idx" ON "TestCaseSharedSteps"("caseId");

-- CreateIndex
CREATE INDEX "TestCaseSharedSteps_sharedStepSetId_idx" ON "TestCaseSharedSteps"("sharedStepSetId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseSharedSteps_caseId_sharedStepSetId_key" ON "TestCaseSharedSteps"("caseId", "sharedStepSetId");

