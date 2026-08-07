[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'NovelVerse\fish-speech'),
  [string]$Repository = 'https://github.com/fishaudio/fish-speech.git',
  [string]$Revision = 'v1.5.1',
  [string]$Model = 'fishaudio/fish-speech-1.5'
)

$ErrorActionPreference = 'Stop'
foreach ($command in @('git', 'uv')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Missing '$command'. Install Git and uv, reopen PowerShell, then retry."
  }
}

if (-not (Test-Path (Join-Path $InstallDir '.git'))) {
  New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir) | Out-Null
  git clone $Repository $InstallDir
}

Push-Location $InstallDir
try {
  git fetch --tags origin
  git checkout $Revision
  uv sync --python 3.12
  $checkpoint = Join-Path $InstallDir 'checkpoints\fish-speech-1.5'
  uv run hf download $Model --local-dir $checkpoint
} finally {
  Pop-Location
}

Write-Host "Fish Speech installed in $InstallDir"
Write-Host 'Start it with: .\voice-worker\start-fish-speech.ps1'
