#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose --env-file .env.production -f docker-compose.production.yml down --timeout 30
