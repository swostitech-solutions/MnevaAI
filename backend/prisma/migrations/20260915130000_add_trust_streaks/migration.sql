-- Consecutive approve/deny streaks that drive automatic trust-level changes.
ALTER TABLE "TrustScore" ADD COLUMN "approvalStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TrustScore" ADD COLUMN "rejectionStreak" INTEGER NOT NULL DEFAULT 0;
