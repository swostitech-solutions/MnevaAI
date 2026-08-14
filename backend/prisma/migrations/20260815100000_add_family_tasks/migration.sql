CREATE TABLE IF NOT EXISTS "FamilyTask" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "creatorId"    TEXT NOT NULL,
  "assigneeId"   TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "status"       TEXT NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
  "priority"     TEXT NOT NULL DEFAULT 'Medium',
  "category"     TEXT,
  "dueDate"      TEXT,
  "recurrence"   TEXT NOT NULL DEFAULT 'None',
  "checklist"    JSONB NOT NULL DEFAULT '[]',
  "comments"     JSONB NOT NULL DEFAULT '[]',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FamilyTask_connectionId_idx" ON "FamilyTask"("connectionId");
CREATE INDEX IF NOT EXISTS "FamilyTask_creatorId_idx"    ON "FamilyTask"("creatorId");
CREATE INDEX IF NOT EXISTS "FamilyTask_assigneeId_idx"   ON "FamilyTask"("assigneeId");

ALTER TABLE "FamilyTask" ADD CONSTRAINT "FamilyTask_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "FamilyConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyTask" ADD CONSTRAINT "FamilyTask_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyTask" ADD CONSTRAINT "FamilyTask_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
