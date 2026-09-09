CREATE TABLE IF NOT EXISTS "ReminderSchedule" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "itemType"    TEXT NOT NULL,
  "itemId"      TEXT NOT NULL,
  "leadMinutes" INTEGER NOT NULL,
  "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReminderSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReminderSchedule_userId_itemType_itemId_leadMinutes_key"
  ON "ReminderSchedule"("userId", "itemType", "itemId", "leadMinutes");

CREATE INDEX IF NOT EXISTS "ReminderSchedule_userId_idx" ON "ReminderSchedule"("userId");

ALTER TABLE "ReminderSchedule" ADD CONSTRAINT "ReminderSchedule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
