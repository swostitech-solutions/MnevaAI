-- Audit item G-08: EmailInsight was implicitly Gmail-only (its messageId
-- column assumed one id space) — provider distinguishes a Gmail-sourced row
-- from an Outlook-sourced one now that emailInsights.queue.js scans both.
-- Existing rows all predate this and are genuinely Gmail, so the default
-- backfills them correctly with no separate UPDATE needed.
ALTER TABLE "EmailInsight" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'gmail';

DROP INDEX "EmailInsight_userId_messageId_type_key";

CREATE UNIQUE INDEX "EmailInsight_userId_messageId_type_provider_key" ON "EmailInsight"("userId", "messageId", "type", "provider");
