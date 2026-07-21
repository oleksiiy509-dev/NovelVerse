# Local Worker Setup

1. Install Node.js 20 or newer.
2. Run `npm install` in `voice-worker/`.
3. Copy `.env.example` to `.env` and set `TOKEN`, `PORT`, `HOST`, `DEFAULT_PROVIDER`, and `DEFAULT_LANGUAGE`.
4. Start with `npm start`.
5. Verify `GET http://127.0.0.1:8787/health` returns HTTP 200.

Generated audio is cached in `VOICE_CACHE_DIR` and identical requests reuse the same file.
