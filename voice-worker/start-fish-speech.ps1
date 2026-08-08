[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'NovelVerse\fish-speech'),
  [string]$CheckpointDir = (Join-Path $env:LOCALAPPDATA 'NovelVerse\fish-speech\checkpoints\fish-speech-1.5'),
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$server = Join-Path $InstallDir 'tools\api_server.py'
$codec = Join-Path $CheckpointDir 'firefly-gan-vq-fsq-8x1024-21hz-generator.pth'
if (-not (Test-Path $server)) {
  throw "Fish Speech is not installed at $InstallDir. Run setup-fish-speech.ps1 first."
}
if (-not (Test-Path $CheckpointDir)) {
  throw "Fish Speech checkpoint is missing at $CheckpointDir. Run setup-fish-speech.ps1 first."
}
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw "Missing Python's 'py' launcher. Install Python for Windows, then retry."
}
& py -m uv --version
if ($LASTEXITCODE -ne 0) {
  throw "Python can not run uv. Install it with 'py -m pip install uv', then retry."
}

Push-Location $InstallDir
try {
  $arguments = @(
    'run', 'python', $server,
    '--listen', "127.0.0.1:$Port",
    '--llama-checkpoint-path', $CheckpointDir
  )
  if (Test-Path $codec) {
    $arguments += @('--decoder-checkpoint-path', $codec)
  }
  Write-Host "Starting Fish Speech at http://127.0.0.1:$Port (Ctrl+C to stop)"
  & py -m uv @arguments
  if ($LASTEXITCODE -ne 0) { throw "Fish Speech exited with code $LASTEXITCODE" }
} finally {
  Pop-Location
}
