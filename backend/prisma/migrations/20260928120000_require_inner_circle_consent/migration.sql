-- Inner Circle (L4) now requires the user's explicit consent.
ALTER TABLE "DomainTrust" ADD COLUMN "pendingL4Confirm" BOOLEAN NOT NULL DEFAULT false;

-- Users who reached L4 automatically never agreed to Mneva acting without
-- asking. Move them back to L3 and offer Inner Circle again; it switches on
-- as soon as they tap "Allow" in Trust & Autonomy.
UPDATE "DomainTrust"
SET "level" = 3, "pendingL4Confirm" = true, "levelEnteredAt" = NOW(),
    "actionsAtLevel" = 0, "acceptedAtLevel" = 0, "rejectedAtLevel" = 0
WHERE "level" >= 4;
