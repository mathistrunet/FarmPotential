# Compile le lanceur Windows (FarmPotential.exe) à la racine du projet.
#
# Utilise csc.exe fourni avec le .NET Framework de Windows : aucune installation
# supplémentaire n'est nécessaire.
#
#   npm run build:exe
#   ou : powershell -ExecutionPolicy Bypass -File scripts/build-launcher.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "launcher\FarmPotentialLauncher.cs"
$output = Join-Path $root "FarmPotential.exe"

if (-not (Test-Path $source)) {
    throw "Source du lanceur introuvable : $source"
}

$cscCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) {
    throw "Compilateur C# introuvable. Installez le .NET Framework 4 (fourni avec Windows 10/11)."
}

Write-Host "Compilateur : $csc"
Write-Host "Source      : $source"
Write-Host "Sortie      : $output"

$arguments = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/out:$output",
    "/reference:System.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Core.dll",
    $source
)

& $csc $arguments
if ($LASTEXITCODE -ne 0) {
    throw "La compilation a échoué (code $LASTEXITCODE)."
}

Write-Host ""
Write-Host "FarmPotential.exe généré. Double-cliquez dessus pour lancer l'application."
