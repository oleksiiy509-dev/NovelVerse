#!/bin/sh
set -eu

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
: "${NOVELVERSE_PIPER_URL:?Set NOVELVERSE_PIPER_URL}"
: "${NOVELVERSE_PIPER_TOKEN:?Set NOVELVERSE_PIPER_TOKEN}"

command -v supabase >/dev/null 2>&1 || { echo 'Supabase CLI is required' >&2; exit 1; }
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push --include-all
supabase secrets set \
  NOVELVERSE_TTS_PROVIDER="${NOVELVERSE_TTS_PROVIDER:-piper}" \
  NOVELVERSE_PIPER_URL="$NOVELVERSE_PIPER_URL" \
  NOVELVERSE_PIPER_TOKEN="$NOVELVERSE_PIPER_TOKEN"
supabase functions deploy generate-chapter-audio --no-verify-jwt=false
supabase functions deploy analyze-chapter-voice --no-verify-jwt=false
