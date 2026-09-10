-- Adds the hash-chain columns backing the Twin Diary's "signed, tamper-proof"
-- ledger claim. All three are nullable so this applies cleanly against an
-- AgentLedger table that already has rows; ledgerBackfill.js fills them in
-- for pre-existing rows on server boot, and every new row gets them set at
-- write time going forward (see ledgerService.js).
ALTER TABLE "AgentLedger" ADD COLUMN "seq" INTEGER;
ALTER TABLE "AgentLedger" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "AgentLedger" ADD COLUMN "hash" TEXT;

-- Partial unique index: only enforced once a row actually has a seq value,
-- so it does not fail against existing rows (which start out NULL) but
-- still protects every row written from this point on, and every row the
-- backfill assigns a seq to.
CREATE UNIQUE INDEX "AgentLedger_userId_seq_key" ON "AgentLedger"("userId", "seq") WHERE "seq" IS NOT NULL;
