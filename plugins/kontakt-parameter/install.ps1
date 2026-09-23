$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$marketplaceRoot = Split-Path -Parent $root

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  throw "Codex CLI was not found. Install or open Codex Desktop first."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 20 or newer first."
}

$env:CODEX_HOME = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
codex plugin marketplace add $marketplaceRoot
codex plugin add "kontakt-parameter@kontakt-internal"
node (Join-Path $PSScriptRoot "scripts\enable-web-search.mjs")

Write-Host ""
Write-Host "Plugin installed and live Codex web search enabled. No Parameter sign-in is required."
Write-Host ""
Write-Host "Done. Open a new Codex task and ask it to search for a product."
