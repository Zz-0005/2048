<#
.SYNOPSIS
  Serves the single-file build and puts it on a public HTTPS URL.

.DESCRIPTION
  Copies 2048-standalone.html into a temp folder as index.html, serves that folder
  on loopback only, and forwards it through localhost.run over SSH. Anyone with the
  printed https://<name>.lhr.life link can play; the link lives as long as this
  window and this machine stay up. Nothing outside the temp folder is exposed.

  Requires: Node on PATH, and the Windows OpenSSH client (ssh.exe).
#>
param(
  [int]$Port = 8790,
  [string]$Node
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $env:TEMP '2048-public-site'
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'

if (-not $Node) {
  $Node = (Get-Command node -ErrorAction SilentlyContinue).Source
}
if (-not $Node) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
  )
  $Node = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Node -or -not (Test-Path $Node)) {
  throw 'node was not found: install Node.js, or pass -Node C:\path\to\node.exe'
}
if (-not (Test-Path $ssh)) { throw 'the Windows OpenSSH client (ssh.exe) is missing' }

New-Item -ItemType Directory -Force -Path $site | Out-Null
Copy-Item (Join-Path $root '2048-standalone.html') (Join-Path $site 'index.html') -Force

$env:ROOT = $site
$env:PORT = [string]$Port
$env:HOST = '127.0.0.1'
$server = Start-Process -FilePath $Node -ArgumentList (Join-Path $root 'tests/serve.mjs') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  Write-Host "Serving $site on http://127.0.0.1:$Port (loopback only)." -ForegroundColor Cyan
  Write-Host 'The https://...lhr.life line below is the link to share.' -ForegroundColor Cyan
  & $ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=30 `
    -o ExitOnForwardFailure=yes -R "80:127.0.0.1:$Port" nokey@localhost.run
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
