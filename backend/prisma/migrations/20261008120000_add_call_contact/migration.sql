-- Tracks per-contact call-frequency so Mneva can notice when a day goes by
-- without contacting someone the user normally talks to often, and nudge
-- them (see backend/src/queues/callLogReminder.queue.js). callDates is a
-- rolling window of recent call-days, not a full call history -- raw call
-- log content itself is never stored.
CREATE TABLE "CallContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "contactName" TEXT,
    "callDates" JSONB NOT NULL DEFAULT '[]',
    "lastCallAt" TIMESTAMP(3) NOT NULL,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "isFrequent" BOOLEAN NOT NULL DEFAULT false,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallContact_userId_phoneNumber_key" ON "CallContact"("userId", "phoneNumber");

CREATE INDEX "CallContact_userId_idx" ON "CallContact"("userId");

ALTER TABLE "CallContact" ADD CONSTRAINT "CallContact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
