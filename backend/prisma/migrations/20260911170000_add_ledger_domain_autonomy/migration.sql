-- Add nullable domain/autonomyStage columns to AgentLedger. Nullable and with
-- no backfill: ledgerService.toPublicEntry() derives these from `tool` for
-- any row where they're NULL, so existing rows keep classifying correctly.
ALTER TABLE "AgentLedger" ADD COLUMN "domain" TEXT;
ALTER TABLE "AgentLedger" ADD COLUMN "autonomyStage" TEXT;
