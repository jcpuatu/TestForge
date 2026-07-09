-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN "references" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "startDate" DATETIME;

-- AlterTable
ALTER TABLE "TestPlan" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "TestPlan" ADD COLUMN "referenceId" TEXT;
ALTER TABLE "TestPlan" ADD COLUMN "startDate" DATETIME;

-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "TestRun" ADD COLUMN "startDate" DATETIME;

