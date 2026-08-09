#!/bin/sh
set -eu

compose="docker compose -f docker-compose.production.yml"
$compose ps
for service in api voice-worker fish-speech; do
  container="$($compose ps -q "$service")"
  [ -n "$container" ] || { echo "$service is not running" >&2; exit 1; }
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
  [ "$status" = healthy ] || [ "$status" = running ] || { echo "$service is $status" >&2; exit 1; }
done
echo 'All NovelVerse services are healthy.'
