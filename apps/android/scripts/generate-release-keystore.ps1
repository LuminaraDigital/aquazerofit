<#
.SYNOPSIS
    Generates a production 4096-bit RSA release signing keystore for AquaZeroFit Android.
.DESCRIPTION
    Uses keytool to generate a high-entropy release key, outputting release.jks and
    populating keystore.properties for local Gradle builds.
#>
param(
    [string]$KeystoreName = "release.jks",
    [string]$Alias = "aquazerofit-release",
    [string]$Password = "",
    [int]$ValidityDays = 10000
)

$ErrorActionPreference = "Stop"

# Locate keytool
$Keytool = "keytool"
if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\keytool.exe")) {
    $Keytool = "$env:JAVA_HOME\bin\keytool.exe"
}

if (-not $Password) {
    # Generate random 24-character password if not provided
    $Password = [System.Web.Security.Membership]::GeneratePassword(24, 4)
    Write-Host "Generated strong keystore password: $Password" -ForegroundColor Yellow
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AndroidDir = Split-Path -Parent $ScriptDir
$KeystorePath = Join-Path $AndroidDir $KeystoreName
$PropertiesPath = Join-Path $AndroidDir "keystore.properties"

if (Test-Path $KeystorePath) {
    Write-Warning "Keystore already exists at $KeystorePath! Aborting to prevent overwrite."
    exit 1
}

Write-Host "Generating 4096-bit RSA release keystore at: $KeystorePath" -ForegroundColor Cyan

& $Keytool -genkeypair -v `
    -keystore $KeystorePath `
    -alias $Alias `
    -keyalg RSA `
    -keysize 4096 `
    -validity $ValidityDays `
    -storepass $Password `
    -keypass $Password `
    -dname "CN=AquaZeroFit, OU=Mobile Engineering, O=AquaZeroFit, L=Melbourne, ST=VIC, C=AU"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Keystore generated successfully!" -ForegroundColor Green

    $propsContent = @"
# Generated $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
storeFile=$KeystoreName
storePassword=$Password
keyAlias=$Alias
keyPassword=$Password
"@
    Set-Content -Path $PropertiesPath -Value $propsContent -Encoding UTF8
    Write-Host "Created local keystore.properties at $PropertiesPath" -ForegroundColor Green
    Write-Host "IMPORTANT: Keep this keystore safe and backed up for Google Play updates!" -ForegroundColor Yellow
} else {
    Write-Error "Failed to generate keystore."
}
