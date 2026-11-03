# Sets JAVA_HOME for Gradle and the Android CLI when the system value is missing
# or corrupted. Source from PowerShell before building:
#
#   . .\apps\android\scripts\env.ps1
#   cd apps\android; .\gradlew.bat test assembleDebug
#
$ErrorActionPreference = "Stop"

function Find-Jbr {
    $candidates = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "$env:ProgramFiles\Android\Android Studio\jbr",
        "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr",
        "$env:ProgramFiles\JetBrains\IntelliJ IDEA*\jbr"
    )
    foreach ($pattern in $candidates) {
        if (Test-Path "$pattern\bin\java.exe") {
            return (Resolve-Path $pattern).Path.Trim()
        }
        Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
            $java = Join-Path $_.FullName "bin\java.exe"
            if (Test-Path $java) { return $_.FullName.Trim() }
        }
    }
    return $null
}

$jbr = Find-Jbr
if (-not $jbr) {
    Write-Error "No JetBrains Runtime found. Install Android Studio or IntelliJ with JBR."
}

$env:JAVA_HOME = $jbr.Trim()
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Write-Host "JAVA_HOME=$env:JAVA_HOME"
