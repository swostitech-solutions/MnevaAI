-- Single-device-login enforcement: each user gets one "current session id",
-- regenerated on every fresh login. The access JWT carries a matching claim
-- and every request is checked against this column, so logging in on a new
-- device silently invalidates every other device's token.
ALTER TABLE "User" ADD COLUMN "currentSessionId" TEXT;

-- Clean cutover: every already-issued refresh token predates this feature
-- and has no associated session id, so leaving them valid would let an
-- already-logged-in device silently refresh past the new rule (both an old
-- and a new device could then run in parallel forever). Deleting them once,
-- here, forces every currently-logged-in device through a real /login call
-- exactly once, which is what actually establishes its first session id.
DELETE FROM "RefreshToken";
