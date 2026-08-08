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

1. Install an NVIDIA driver, Git for Windows, Node.js 20+, and Python. Ensure the
   Python installer enabled the Windows `py` launcher.
2. Open PowerShell in the NovelVerse repository.
3. Install uv into Python and confirm that it works (uv does **not** need to be in
   `PATH`):

   ```powershell
   py -m pip install --upgrade uv
   py -m uv --version
   ```

4. Allow the checked-in scripts for this PowerShell process:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   ```

5. Run the setup script once:

   ```powershell
   .\voice-worker\setup-fish-speech.ps1
   ```

   The script uses `py -m uv` internally, installs the mutually compatible
   `torch 2.4.1`, `torchvision 0.19.1`, and `torchaudio 2.4.1` wheels from the
   official PyTorch `cu121` index, and imports both Torch and TorchAudio before
   continuing. CUDA 12.1 wheels are compatible with an NVIDIA driver supporting
   CUDA 12.2. The setup prints the installed versions and detected GPU, verifies
   both the server checkout and model download, and stops immediately if a native
   command fails. The default checkout is pinned to `v1.5.1` so upstream
   command-line changes do not silently break startup.
6. Run the service and leave that PowerShell window open:

   ```powershell
   .\voice-worker\start-fish-speech.ps1
   ```

   Startup also uses `py -m uv`; a standalone `uv.exe` in `PATH` is neither used
   nor required.
7. In a second PowerShell window, wait for Fish Speech to finish loading and
   verify its synthesis route is ready:

   ```powershell
   do {
     Start-Sleep -Seconds 2
     try { Invoke-WebRequest http://127.0.0.1:8080/v1/tts -UseBasicParsing; $status = 200 }
     catch { $status = $_.Exception.Response.StatusCode.value__ }
   } until ($status -eq 405)
   $status
   ```

   This prints `405`, the expected response for GET on the POST-only TTS route.
   Initial connection failures while the model is loading are expected.
8. In that second window, start the NovelVerse gateway:

   ```powershell
   Set-Location .\voice-worker
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   npm install
   npm start
   ```

9. In a third window, run:

   ```powershell
   try { Invoke-WebRequest http://127.0.0.1:8080/v1/tts -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ -eq 405 }
   Invoke-RestMethod http://127.0.0.1:8787/health |
     Select-Object status, providers
   ```

The direct probe must report `True`, and the `fish-speech` provider should have
`available: true` in the gateway response.

## Configuration and troubleshooting

- Keep both `FISH_SPEECH_URL` and `FISH_SPEECH_HEALTH_URL` set to
  `http://127.0.0.1:8080/v1/tts` in `voice-worker/.env`. Fish Speech does not
  expose `/health`; the worker treats GET 405 from the POST-only TTS route as ready.
- Do not set `FISH_SPEECH_REFERENCE_ID` unless the same reference exists in Fish
  Speech. NovelVerse's narrator name is not automatically a cloning reference.
- Port already occupied: run `Get-NetTCPConnection -LocalPort 8080` and stop the
  conflicting process. Both the script and `.env` must use the same port.
- GPU/CUDA or `torchaudio` WinError 127: rerun `setup-fish-speech.ps1`. It replaces
  the whole PyTorch family with matching `cu121` wheels and verifies the native
  imports and CUDA device. Do not run a plain `uv sync` afterward because it can
  restore the incompatible upstream wheel selection; the start script uses
  `uv run --no-sync` to preserve the verified wheels.
- `%1 is not a valid Win32 application` / OS error 193: do not invoke `uv`
  directly. Confirm `py -m uv --version` works and use the checked-in scripts,
  which always invoke uv as a Python module.
- To use a different checkout or checkpoint, pass `-InstallDir` and
  `-CheckpointDir` to `start-fish-speech.ps1`.
