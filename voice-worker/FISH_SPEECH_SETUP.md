# Fish Speech startup and connectivity

## Integration decision

NovelVerse's voice worker is only an HTTP client for Fish Speech. The provider
targets `http://127.0.0.1:8080/v1/tts`; nothing in `npm start`, the worker
Dockerfile, or the example Compose file installs a Python runtime, model weights,
or starts port 8080. Consequently, Fish Speech must be downloaded and run as a
separate local Python service. The checked-in PowerShell scripts make that missing
lifecycle explicit.

The existing Compose example intentionally contains only the small Node gateway.
Putting Fish Speech in that Compose stack would require an NVIDIA Container
Toolkit installation, very large image/model downloads, and host-specific GPU
configuration. Windows users get fewer moving parts by using the upstream uv
environment directly. Docker remains an optional upstream deployment choice, not
a prerequisite for NovelVerse.

## Exact Windows sequence

1. Install an NVIDIA driver, Git for Windows, Node.js 20+, and uv.
2. Open PowerShell in the NovelVerse repository.
3. Run `Set-ExecutionPolicy -Scope Process Bypass`.
4. Run `.\voice-worker\setup-fish-speech.ps1` once. The default checkout is pinned
   to `v1.5.1` so upstream command-line changes do not silently break startup.
5. Run `.\voice-worker\start-fish-speech.ps1` and leave that window open.
6. In another PowerShell window, run:

   ```powershell
   Set-Location .\voice-worker
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   npm install
   npm start
   ```

7. In a third window, run:

   ```powershell
   Test-NetConnection 127.0.0.1 -Port 8080
   Invoke-RestMethod http://127.0.0.1:8787/health |
     Select-Object status, providers
   ```

The `fish-speech` provider should have `available: true`. A response such as 404
from the direct port-8080 `/health` request is acceptable; no response/connection
refusal is not.

## Configuration and troubleshooting

- Keep `FISH_SPEECH_URL=http://127.0.0.1:8080/v1/tts` and
  `FISH_SPEECH_HEALTH_URL=http://127.0.0.1:8080/health` in `voice-worker/.env`.
- Do not set `FISH_SPEECH_REFERENCE_ID` unless the same reference exists in Fish
  Speech. NovelVerse's narrator name is not automatically a cloning reference.
- Port already occupied: run `Get-NetTCPConnection -LocalPort 8080` and stop the
  conflicting process. Both the script and `.env` must use the same port.
- GPU/CUDA error: update the NVIDIA driver and repeat `uv sync` in the Fish Speech
  install directory. Do not replace the Node worker dependencies.
- To use a different checkout or checkpoint, pass `-InstallDir` and
  `-CheckpointDir` to `start-fish-speech.ps1`.
