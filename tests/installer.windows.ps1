# Exercise absent/old Node and checksum failure without network or user PATH changes.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalPath = $env:PATH
$realNode = (Get-Command node.exe).Source
$sandboxRoot = Join-Path $projectRoot ('output\installer-branches-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sandboxRoot -Force | Out-Null
$oldNode = Join-Path $sandboxRoot 'old-node.cmd'
[IO.File]::WriteAllText($oldNode, "@echo off`r`necho v20.0.0`r`n")
$global:codecityTestOld = $false
$global:codecityTestBadChecksum = $false
$global:codecityTestDownloads = 0
function Get-Command {
    param($Name, $ErrorAction)
    if ($Name -eq 'node.exe') {
        if ($global:codecityTestOld) { return [pscustomobject]@{Source=$oldNode} }
        return $null
    }
    Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction $ErrorAction
}
function Invoke-RestMethod {
    param($Uri)
    if ($Uri -ne 'https://nodejs.org/dist/index.json') { throw 'Unexpected release URL' }
    return @(
        [pscustomobject]@{version='v26.1.0';lts=$false;files=@('win-x64-zip','win-arm64-zip')},
        [pscustomobject]@{version='v24.1.0';lts='Test';files=@('win-x64-zip','win-arm64-zip')}
    )
}
function Invoke-WebRequest {
    param($Uri, $OutFile, [switch]$UseBasicParsing)
    if ($OutFile) {
        $global:codecityTestDownloads++
        [IO.File]::WriteAllText($OutFile, 'mock archive')
        $global:codecityTestArchive = $OutFile
        return
    }
    $hash = (Get-FileHash -LiteralPath $global:codecityTestArchive -Algorithm SHA256).Hash
    if ($global:codecityTestBadChecksum) { $hash = '0' * 64 }
    return [pscustomobject]@{Content=($hash + '  ' + [IO.Path]::GetFileName($global:codecityTestArchive))}
}
function Expand-Archive {
    param($LiteralPath, $DestinationPath, [switch]$Force)
    $runtime = Join-Path $DestinationPath ([IO.Path]::GetFileNameWithoutExtension($LiteralPath))
    $npmBin = Join-Path $runtime 'node_modules\npm\bin'
    New-Item -ItemType Directory -Path $npmBin -Force | Out-Null
    Copy-Item -LiteralPath $realNode -Destination (Join-Path $runtime 'node.exe')
    # Record npm's chosen prefix, and provide a launcher for the installer to validate.
    $mockNpm = @'
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),prefix=args[args.indexOf('--prefix')+1];
const cli=path.join(prefix,'node_modules','codecity-viewer','server','cli.cjs');
fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'// installed by test');
fs.writeFileSync(path.join(prefix,'npm-args.json'),JSON.stringify(args));
'@
    [IO.File]::WriteAllText((Join-Path $npmBin 'npm-cli.js'), $mockNpm)
}
try {
    foreach ($case in @('missing','old','current')) {
        $global:codecityTestOld = $case -eq 'old'
        $dest = Join-Path $sandboxRoot $case
        $channel = if ($case -eq 'current') { 'current' } else { 'lts' }
        & (Join-Path $projectRoot 'scripts\install.ps1') -PackageSpec 'test-package' -InstallRoot $dest -NoPath -NoLaunch -NodeChannel $channel
        $expectedVersion = if ($case -eq 'current') { 'v26.1.0' } else { 'v24.1.0' }
        if (-not (Test-Path (Join-Path $dest "runtime\node-$expectedVersion-win-*\node.exe"))) { throw "Wrong runtime selected: $case" }
        $argsUsed = Get-Content (Join-Path $dest 'app\npm-args.json') -Raw | ConvertFrom-Json
        if ($argsUsed -notcontains '--omit=dev' -or $argsUsed[-1] -ne 'test-package') { throw "Wrong npm arguments: $case" }
        Write-Host "PASS installer $case Node branch"
    }
    $global:codecityTestBadChecksum = $true
    $rejected = $false
    try {
        & (Join-Path $projectRoot 'scripts\install.ps1') -PackageSpec 'test-package' -InstallRoot (Join-Path $sandboxRoot 'corrupt') -NoPath -NoLaunch
    } catch {
        if ($_.Exception.Message -notmatch 'checksum verification failed') { throw }
        $rejected = $true
    }
    if (-not $rejected) { throw 'Installer accepted a corrupted archive' }
    Write-Host 'PASS installer rejects checksum mismatch'
    if ($global:codecityTestDownloads -ne 4) { throw 'Download branch was not exercised' }
} finally { $env:PATH = $originalPath }
