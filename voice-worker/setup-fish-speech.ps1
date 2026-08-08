[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'NovelVerse\fish-speech'),
  [string]$Repository = 'https://github.com/fishaudio/fish-speech.git',
  [string]$Revision = 'v1.5.1',
  [string]$Model = 'fishaudio/fish-speech-1.5'
)

$ErrorActionPreference = 'Stop'
foreach ($command in @('git', 'py')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Missing '$command'. Install Git for Windows and Python's py launcher, then retry."
  }
}

# The Windows uv installer does not always add uv.exe to PATH.  Invoking the
# installed Python module also avoids Windows trying to execute an incompatible
# uv shim, which fails with Win32 error 193.
& py -m uv --version
if ($LASTEXITCODE -ne 0) {
  throw "Python can not run uv. Install it with 'py -m pip install uv', then retry."
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "'$Command $($Arguments -join ' ')' exited with code $LASTEXITCODE."
  }
}

if (-not (Test-Path (Join-Path $InstallDir '.git'))) {
  New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir) | Out-Null
  Invoke-NativeCommand -Command git -Arguments @('clone', $Repository, $InstallDir)
}

Push-Location $InstallDir
try {
  Invoke-NativeCommand -Command git -Arguments @('fetch', '--tags', 'origin')
  Invoke-NativeCommand -Command git -Arguments @('checkout', '--force', $Revision)
  Invoke-NativeCommand -Command py -Arguments @('-m', 'uv', 'sync', '--python', '3.12')
  $checkpoint = Join-Path $InstallDir 'checkpoints\fish-speech-1.5'
  Invoke-NativeCommand -Command py -Arguments @(
    '-m', 'uv', 'run', 'hf', 'download', $Model, '--local-dir', $checkpoint
  )

  $server = Join-Path $InstallDir 'tools\api_server.py'
  if (-not (Test-Path $server)) {
    throw "Installation verification failed: $server was not created."
  }
  $codec = Join-Path $checkpoint 'firefly-gan-vq-fsq-8x1024-21hz-generator.pth'
  if (-not (Test-Path $codec)) {
    throw "Installation verification failed: checkpoint download did not create $codec."
  }
} finally {
  Pop-Location
}

Write-Host "Fish Speech installed in $InstallDir"
Write-Host 'Start it with: .\voice-worker\start-fish-speech.ps1'
