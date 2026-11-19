#!/usr/bin/env bash
# S-12: `prisma generate` runs first, unguarded — if it fails (bad schema,
# missing engine, etc.) that was already loud pre-existing and stays so.
#
# `prisma migrate resolve` below is a one-time idempotent fixup for a single
# historical migration (20260823082440_add_missing_pet_family_models). The
# old one-liner wrapped it in an unconditional `|| true`. That's narrower
# than it looks: this call only ever fails one of two ways, and neither one
# is a real migration problem going unnoticed —
#   1. the migration is already resolved from a previous install (expected
#      on every run after the first)
#   2. the database isn't reachable from here at all (true for every CI run,
#      which only sets a placeholder DATABASE_URL) — in which case no real
#      migration state is at risk from skipping this, and the VPS deploy
#      script's own `prisma migrate deploy` (unmasked, under `set -e`) is
#      what actually has a real connection and is the real safety net for
#      "fail loudly if a migration can't apply."
# Anything else — a different, unrecognized error — still fails loud.
set -euo pipefail

npx prisma generate

output=$(npx prisma migrate resolve --rolled-back 20260823082440_add_missing_pet_family_models 2>&1) && {
  echo "$output"
  exit 0
}
echo "$output"
if echo "$output" | grep -qiE "already (applied|recorded|rolled back)|no migration found|is already recorded|not in a failed state|can.t reach database|authentication failed|P1001|P1000"; then
  echo "postinstall: migration resolve skipped (already resolved, or no DB reachable from here — see comment above) — continuing."
  exit 0
fi
echo "postinstall: prisma migrate resolve failed for an unexpected reason — see output above."
exit 1
