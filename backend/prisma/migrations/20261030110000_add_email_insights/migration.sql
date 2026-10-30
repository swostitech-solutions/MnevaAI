-- Daily Gmail scan results: follow-ups the user is waiting on a reply for,
-- and commitments the user made that haven't become a real Task yet. See
-- backend/src/services/emailInsightScanner.js.
CREATE TABLE "EmailInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT NOT NULL,
    "recipient" TEXT,
    "snippet" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "dueText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailInsight_userId_messageId_type_key" ON "EmailInsight"("userId", "messageId", "type");

CREATE INDEX "EmailInsight_userId_status_idx" ON "EmailInsight"("userId", "status");

ALTER TABLE "EmailInsight" ADD CONSTRAINT "EmailInsight_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
