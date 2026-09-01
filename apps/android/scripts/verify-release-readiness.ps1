# Verifies local release signing and GitHub secret presence before tagging.
# Usage: .\apps\android\scripts\verify-release-readiness.ps1

$ErrorActionPreference = "Stop"
$repo = "LuminaraDigital/aquazerofit"
$androidDir = Split-Path -Parent $PSScriptRoot

Write-Host "=== AquaZeroFit Android release readiness ===" -ForegroundColor Cyan

$keystore = Join-Path $androidDir "release.jks"
$propsFile = Join-Path $androidDir "keystore.properties"
if (-not (Test-Path $keystore)) {
    Write-Error "Missing $keystore — run generate-release-keystore.ps1 first."
}
if (-not (Test-Path $propsFile)) {
    Write-Error "Missing $propsFile"
}
Write-Host "[OK] Local keystore and keystore.properties exist" -ForegroundColor Green

. (Join-Path $PSScriptRoot "env.ps1")
Push-Location $androidDir
try {
    Write-Host "Building signed release bundle..." -ForegroundColor Cyan
    & .\gradlew.bat bundleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "bundleRelease failed" }
    $aab = Get-ChildItem "app\build\outputs\bundle\release\*.aab" | Select-Object -First 1
    if (-not $aab) { throw "No AAB produced" }
    Write-Host "[OK] Signed AAB: $($aab.FullName)" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "Checking GitHub secrets..." -ForegroundColor Cyan
$required = @("AZF_KEYSTORE_BASE64", "AZF_KEYSTORE_PASSWORD", "AZF_KEY_ALIAS", "AZF_KEY_PASSWORD")
$listed = gh secret list --repo $repo 2>&1 | Out-String
foreach ($name in $required) {
    if ($listed -notmatch $name) {
        Write-Error "Missing GitHub secret: $name"
    }
}
Write-Host "[OK] All four signing secrets present on $repo" -ForegroundColor Green

$envInfo = gh api "repos/$repo/environments/release" 2>&1 | Out-String
if ($envInfo -match '"name":"release"') {
    Write-Host "[OK] GitHub release environment exists" -ForegroundColor Green
} else {
    Write-Warning "GitHub release environment not found — create it in repo Settings → Environments"
}

Write-Host ""
Write-Host "Next: commit and push, then tag (v1.2.0 is next after v1.1.0):" -ForegroundColor Yellow
Write-Host "  git push origin HEAD"
Write-Host "  git tag v1.2.0"
Write-Host "  git push origin v1.2.0"
Write-Host ""
Write-Host "Or trigger manually after push:" -ForegroundColor Yellow
Write-Host "  gh workflow run android-release.yml --repo $repo"
