# Remove a per-user CodeCity installation created by install.ps1.
[CmdletBinding()]
param(
    [string]$InstallRoot = '',
    [switch]$KeepPath
)
$ErrorActionPreference = 'Stop'
if (-not $InstallRoot) { $InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodeCity' }
$installRoot = [IO.Path]::GetFullPath($InstallRoot)

$removed = @()
foreach ($name in @('codecity.cmd', 'code-city.cmd')) {
    $launcher = Join-Path $installRoot $name
    if (Test-Path -LiteralPath $launcher) { Remove-Item -LiteralPath $launcher -Force; $removed += $name }
}
foreach ($dir in @('app', 'runtime')) {
    $target = Join-Path $installRoot $dir
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force; $removed += $dir }
}
if (-not $KeepPath) {
    $userPath = [string][Environment]::GetEnvironmentVariable('Path', 'User')
    $trimmed = $installRoot.TrimEnd('\')
    $parts = @($userPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $trimmed })
    $next = ($parts -join ';')
    if ($next -ne $userPath) {
        [Environment]::SetEnvironmentVariable('Path', $next, 'User')
        $removed += 'PATH entry'
    }
}
$leftovers = @(Get-ChildItem -LiteralPath $installRoot -Force -ErrorAction SilentlyContinue)
if ($leftovers.Count -eq 0) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
    if ($removed -notcontains $installRoot) { $removed += $installRoot }
}
if ($removed.Count) { Write-Host "CodeCity uninstalled. Removed: $($removed -join ', ')" }
else { Write-Host 'No CodeCity installation was found.' }
