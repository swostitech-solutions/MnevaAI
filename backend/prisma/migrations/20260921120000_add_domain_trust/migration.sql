-- Per-domain Trust & Autonomy: Finance / Communication / Health / Family
-- each earn trust on their own clock instead of one global User.trustLevel.
CREATE TABLE "DomainTrust" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "levelEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionsAtLevel" INTEGER NOT NULL DEFAULT 0,
    "acceptedAtLevel" INTEGER NOT NULL DEFAULT 0,
    "rejectedAtLevel" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pendingL2Confirm" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainTrust_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainTrust_userId_domain_key" ON "DomainTrust"("userId", "domain");
CREATE INDEX "DomainTrust_userId_idx" ON "DomainTrust"("userId");

ALTER TABLE "DomainTrust" ADD CONSTRAINT "DomainTrust_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing user gets all 4 domains seeded at their CURRENT
-- global trustLevel (not reset to L1) — no one gets suddenly locked back
-- down to Observe-only across the board the moment this ships.
INSERT INTO "DomainTrust" ("id", "userId", "domain", "level", "levelEnteredAt", "updatedAt")
SELECT gen_random_uuid(), "id", d.domain, GREATEST(1, LEAST(4, "trustLevel")), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
CROSS JOIN (VALUES ('finance'), ('communications'), ('health'), ('family')) AS d(domain);
