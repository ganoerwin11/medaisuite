# Run this locally (on the dev machine) to build the frontend and create the deploy package.
# Usage: pwsh deploy/00-package.ps1
# Produces medai-deploy.zip at the project root, ready to upload to the server
# (see deploy/02-unpack-app.sh) alongside deploy/server.env.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    Write-Host "Running tests..."
    npm test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed; aborting package." }

    Write-Host "Building production frontend bundle..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed; aborting package." }

    $staging = Join-Path $root ".deploy-staging"
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    New-Item -ItemType Directory -Path $staging | Out-Null

    Write-Host "Staging deployable files..."
    Copy-Item (Join-Path $root "dist") (Join-Path $staging "dist") -Recurse
    Copy-Item (Join-Path $root "server") (Join-Path $staging "server") -Recurse
    Copy-Item (Join-Path $root "package.json") $staging
    Copy-Item (Join-Path $root "package-lock.json") $staging

    $zipPath = Join-Path $root "medai-deploy.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath

    Remove-Item $staging -Recurse -Force
    Write-Host "Created $zipPath"
    Write-Host "Next: scp $zipPath and the deploy/ folder to the server, then follow deploy/README.md from step 3."
}
finally {
    Pop-Location
}
