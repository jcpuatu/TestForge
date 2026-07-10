-- CreateTable
CREATE TABLE "ConfigGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConfigGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Config_configGroupId_fkey" FOREIGN KEY ("configGroupId") REFERENCES "ConfigGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConfigGroup_projectId_idx" ON "ConfigGroup"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigGroup_projectId_name_key" ON "ConfigGroup"("projectId", "name");

-- CreateIndex
CREATE INDEX "Config_configGroupId_idx" ON "Config"("configGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Config_configGroupId_name_key" ON "Config"("configGroupId", "name");

