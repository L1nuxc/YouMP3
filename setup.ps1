$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22+ from https://nodejs.org first.' }
New-Item -ItemType Directory -Force tools | Out-Null
Invoke-WebRequest 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile 'tools/yt-dlp.exe'
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host 'FFmpeg is missing. Install it with: winget install --id Gyan.FFmpeg -e'
    Write-Host 'Then reopen the terminal and run start.cmd.'
} else { Write-Host 'Ready. Run start.cmd to open YouMP3.' }
