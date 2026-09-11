-- Adds actual daily dose-time tracking to ParentMedication, distinct from
-- refillDate (when the supply runs out). medicationDosePoller.js reads this
-- to send a "time to take your medicine" push at each configured time.
ALTER TABLE "ParentMedication" ADD COLUMN "doseTimes" JSONB NOT NULL DEFAULT '[]';
