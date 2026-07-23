param(
  [string]$Voice = "uk_UA-lada-medium",
  [string]$VerificationText = "Привіт, NovelVerse. Piper готовий до озвучення українською.",
  [string]$PiperRoot = (Join-Path $PSScriptRoot "piper")
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  Write-Warning "This script is designed for Windows PowerShell 7+. It may not install the Windows Piper binary on this platform."
}

New-Item -ItemType Directory -Force -Path $PiperRoot | Out-Null
$voicesDir = Join-Path $PiperRoot "voices"
New-Item -ItemType Directory -Force -Path $voicesDir | Out-Null

$piperExe = Join-Path $PiperRoot "piper.exe"
if (-not (Test-Path $piperExe)) {
  Write-Host "Finding latest Windows Piper release..."
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/rhasspy/piper/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -match "windows.*amd64|amd64.*windows|win.*amd64|windows.*x64|x64.*windows" -and $_.name -match "\.zip$" } | Select-Object -First 1
  if (-not $asset) {
    throw "Could not find a Windows x64 Piper zip in the latest rhasspy/piper release. Download Piper manually and set PIPER_BIN in .env."
  }
  $zipPath = Join-Path $PiperRoot $asset.name
  Write-Host "Downloading $($asset.browser_download_url)"
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
  $extractDir = Join-Path $PiperRoot "_extract"
  if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
  $found = Get-ChildItem -Path $extractDir -Recurse -Filter "piper.exe" | Select-Object -First 1
  if (-not $found) { throw "Downloaded archive did not contain piper.exe." }
  Copy-Item -Path $found.FullName -Destination $piperExe -Force

  $dlls = Get-ChildItem -Path $found.Directory.FullName -File | Where-Object { $_.Extension -in ".dll", ".onnxruntime", ".json" }
  foreach ($dll in $dlls) { Copy-Item -Path $dll.FullName -Destination (Join-Path $PiperRoot $dll.Name) -Force }
  Remove-Item -Recurse -Force $extractDir
  Write-Host "Installed Piper binary: $piperExe"
} else {
  Write-Host "Piper binary already exists: $piperExe"
}

$voiceInfo = & (Join-Path $PSScriptRoot "download-voices.ps1") -Voice $Voice -PiperRoot $PiperRoot
$modelPath = Join-Path $voicesDir "$Voice.onnx"

$envPath = Join-Path $PSScriptRoot ".env"
$examplePath = Join-Path $PSScriptRoot ".env.example"
if (-not (Test-Path $envPath)) {
  if (Test-Path $examplePath) { Copy-Item $examplePath $envPath } else { New-Item -ItemType File -Path $envPath | Out-Null }
}

function Set-EnvValue {
  param([string]$Path, [string]$Key, [string]$Value)
  $escaped = [regex]::Escape($Key)
  $line = "$Key=$Value"
  $content = if (Test-Path $Path) { Get-Content -Raw -Path $Path } else { "" }
  if ($content -match "(?m)^$escaped=") {
    $content = [regex]::Replace($content, "(?m)^$escaped=.*$", $line)
  } else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) { $content += "`r`n" }
    $content += "$line`r`n"
  }
  Set-Content -Path $Path -Value $content -NoNewline
}

Set-EnvValue -Path $envPath -Key "DEFAULT_PROVIDER" -Value "piper"
Set-EnvValue -Path $envPath -Key "DEFAULT_LANGUAGE" -Value "uk"
Set-EnvValue -Path $envPath -Key "PIPER_BIN" -Value $piperExe
Set-EnvValue -Path $envPath -Key "PIPER_MODEL" -Value $modelPath
Set-EnvValue -Path $envPath -Key "PIPER_VOICE" -Value $Voice

$outFile = Join-Path $PiperRoot "verification.wav"
Write-Host "Verifying Piper synthesis..."
$VerificationText | & $piperExe --model $modelPath --output_file $outFile
if (-not (Test-Path $outFile)) { throw "Verification failed: $outFile was not created." }
if ((Get-Item $outFile).Length -le 44) { throw "Verification failed: output WAV is empty." }

Write-Host "Piper verification audio: $outFile"
Write-Host "Provider status endpoint after starting worker: GET http://127.0.0.1:8787/providers"
