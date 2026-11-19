#!/usr/bin/env bash
# S-12: the old one-liner piped `prisma migrate resolve --rolled-back` into
# `|| true` unconditionally, which also swallowed a real failure (DB down,
# prisma generate itself failing, a genuinely new error) the same way it
# swallowed the one expected case — resolve erroring because that specific
# historical migration (20260823082440_add_missing_pet_family_models) was
# already marked rolled-back on a previous install, which is the only
# outcome this script should treat as success.
set -euo pipefail

npx prisma generate

output=$(npx prisma migrate resolve --rolled-back 20260823082440_add_missing_pet_family_models 2>&1) && {
  echo "$output"
  exit 0
}
echo "$output"
if echo "$output" | grep -qiE "already (applied|recorded|rolled back)|no migration found|is already recorded"; then
  echo "postinstall: migration already resolved on a previous install, continuing."
  exit 0
fi
echo "postinstall: prisma migrate resolve failed for an unexpected reason — see output above."
exit 1
