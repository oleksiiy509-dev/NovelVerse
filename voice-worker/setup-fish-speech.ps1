[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'NovelVerse\fish-speech'),
  [string]$Repository = 'https://github.com/fishaudio/fish-speech.git',
  [string]$Revision = 'v1.5.1',
  [string]$Model = 'fishaudio/fish-speech-1.5',
  [string]$TorchVersion = '2.4.1',
  [string]$TorchvisionVersion = '0.19.1',
  [ValidatePattern('^cu[0-9]+$')][string]$CudaWheelTag = 'cu121'
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

  # uv's default Windows resolution can mix a CPU torchaudio wheel with a CUDA
  # torch wheel. That combination leaves torchaudio's native DLL dependencies
  # unresolved and its import fails with WinError 127. Install the matching
  # official CUDA wheel set together after syncing the upstream lock file.
  $venvPython = Join-Path $InstallDir '.venv\Scripts\python.exe'
  if (-not (Test-Path $venvPython)) {
    throw "Installation verification failed: virtual environment Python was not created at $venvPython."
  }
  $torchIndex = "https://download.pytorch.org/whl/$CudaWheelTag"
  Invoke-NativeCommand -Command py -Arguments @(
    '-m', 'uv', 'pip', 'install', '--python', $venvPython, '--reinstall', '--no-deps',
    '--index-url', $torchIndex,
    "torch==$TorchVersion", "torchvision==$TorchvisionVersion", "torchaudio==$TorchVersion"
  )
  Invoke-NativeCommand -Command $venvPython -Arguments @(
    '-c',
    "import torch, torchaudio; expected='$CudaWheelTag'; assert torch.__version__.split('+')[0] == '$TorchVersion', torch.__version__; assert torchaudio.__version__.split('+')[0] == '$TorchVersion', torchaudio.__version__; assert torch.version.cuda and torch.__version__.endswith('+' + expected), (torch.__version__, torch.version.cuda); assert torchaudio.__version__.endswith('+' + expected), torchaudio.__version__; assert torch.cuda.is_available(), 'CUDA is not available to PyTorch'; print(f'torch={torch.__version__} torchaudio={torchaudio.__version__} CUDA={torch.version.cuda} GPU={torch.cuda.get_device_name(0)}')"
  )

  $checkpoint = Join-Path $InstallDir 'checkpoints\fish-speech-1.5'
  Invoke-NativeCommand -Command py -Arguments @(
    '-m', 'uv', 'run', '--no-sync', 'hf', 'download', $Model, '--local-dir', $checkpoint
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
