#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
[ -f .env.production ] || { echo 'Copy .env.production.example to .env.production first.' >&2; exit 1; }
[ "$(stat -c '%a' .env.production)" = 600 ] || echo 'WARNING: run chmod 600 .env.production' >&2
node scripts/validate-production-env.mjs .env.production
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml build --pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d --remove-orphans --wait
scripts/healthcheck.sh
