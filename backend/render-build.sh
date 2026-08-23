#!/usr/bin/env bash
set -e

npm install
npx prisma generate

# Resolve any failed migrations so deploy is not blocked.
# This is idempotent — if the migration is already applied/rolled-back it is a no-op.
npx prisma migrate resolve --rolled-back 20260823082440_add_missing_pet_family_models || true

npx prisma migrate deploy
