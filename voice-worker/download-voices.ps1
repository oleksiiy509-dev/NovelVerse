param(
  [string]$Voice = "uk_UA-lada-medium",
  [string]$BaseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/uk_UA-lada-medium",
  [string]$PiperRoot = (Join-Path $PSScriptRoot "piper")
)

$ErrorActionPreference = "Stop"
$voicesDir = Join-Path $PiperRoot "voices"
New-Item -ItemType Directory -Force -Path $voicesDir | Out-Null

$modelPath = Join-Path $voicesDir "$Voice.onnx"
$configPath = Join-Path $voicesDir "$Voice.onnx.json"

function Download-FileIfMissing {
  param([string]$Url, [string]$Destination)
  if (Test-Path $Destination) {
    Write-Host "Already exists: $Destination"
    return
  }
  Write-Host "Downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $Destination
}

Download-FileIfMissing -Url "$BaseUrl/$Voice.onnx" -Destination $modelPath
Download-FileIfMissing -Url "$BaseUrl/$Voice.onnx.json" -Destination $configPath

Write-Host "Downloaded voice: $Voice"
Write-Host "Model: $modelPath"
Write-Host "Config: $configPath"

[PSCustomObject]@{
  Voice = $Voice
  ModelPath = $modelPath
  ConfigPath = $configPath
  VoicesDir = $voicesDir
}
