# Developer setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and configure Supabase/Telegram values.
3. Run `npm ci`, then `npm run dev`.
4. For local synthesis, copy `voice-worker/.env.example`, run `npm ci` inside `voice-worker`, install a supported Piper voice, and run `npm start`.
5. Before submitting, run `npm test`, `npm run lint`, `npm run build`, and `cd voice-worker && npm test`.

Never commit credentials or generated audio. The worker is optional for reader-only development; Diagnostics reports it as offline and provides recovery guidance.
