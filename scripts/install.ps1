# Install CodeCity for the current user. Existing compatible Node installations are reused.
[CmdletBinding()]
param(
    [string]$PackageSpec = '',
    [string]$InstallRoot = '',
    [ValidateSet('lts', 'current')][string]$NodeChannel = 'lts',
    [switch]$NoPath,
    [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if (-not $InstallRoot) { $InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodeCity' }
$installRoot = [IO.Path]::GetFullPath($InstallRoot)
$appPrefix = Join-Path $installRoot 'app'

function Test-NodeVersion([string]$Executable) {
    try {
        $versionText = & $Executable --version 2>$null
        if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { return $false }
        return ([version]$versionText.Substring(1) -ge [version]'22.13.0')
    } catch { return $false }
}

$nodeExe = $null
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand -and (Test-NodeVersion $nodeCommand.Source)) { $nodeExe = $nodeCommand.Source }
if (-not $nodeExe) {
    $arch = switch ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
        'X64' { 'x64' }
        'Arm64' { 'arm64' }
        default { throw 'CodeCity installer supports Windows x64 and ARM64.' }
    }
    $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object {
        ($NodeChannel -eq 'current' -or $_.lts) -and
        ([version]$_.version.Substring(1) -ge [version]'22.13.0') -and
        ($_.files -contains "win-$arch-zip")
    } | Select-Object -First 1
    if (-not $release) { throw 'No compatible official Node release was found.' }
    $archiveName = "node-$($release.version)-win-$arch.zip"
    $runtimeDir = Join-Path $installRoot "runtime\node-$($release.version)-win-$arch"
    $privateNode = Join-Path $runtimeDir 'node.exe'
    if (Test-NodeVersion $privateNode) { $nodeExe = $privateNode }
    else {
        Write-Host "Installing Node $($release.version) ($NodeChannel) for CodeCity..."
        $tempDir = Join-Path ([IO.Path]::GetTempPath()) ('codecity-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        try {
            $archive = Join-Path $tempDir $archiveName
            $baseUrl = "https://nodejs.org/dist/$($release.version)"
            Invoke-WebRequest "$baseUrl/$archiveName" -OutFile $archive -UseBasicParsing
            $checksums = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
            $checksumLine = ($checksums -split "`n") | Where-Object { $_.Trim().EndsWith("  $archiveName") } | Select-Object -First 1
            if (-not $checksumLine -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne ($checksumLine -split '\s+')[0]) {
                throw 'Node download checksum verification failed.'
            }
            $runtimeRoot = Join-Path $installRoot 'runtime'
            New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
            Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
            if (-not (Test-NodeVersion $privateNode)) { throw 'Downloaded Node failed its version check.' }
            $nodeExe = $privateNode
        } finally {
            # Only delete the unique temporary directory created above.
            $resolvedTemp = [IO.Path]::GetFullPath($tempDir)
            $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
            if ($resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
            }
        }
    }
} else { Write-Host "Using Node $(& $nodeExe --version) at $nodeExe" }

$npmCli = Join-Path (Split-Path -Parent $nodeExe) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCommand) { $npmCli = Join-Path (Split-Path -Parent $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js' }
}
if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Node was found, but npm is missing. Install the official Node distribution and retry.' }
if (-not $PackageSpec) {
    $checkout = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { '' }
    if ($PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $checkout 'package.json'))) { $PackageSpec = $checkout }
    else { $PackageSpec = 'https://codeload.github.com/Amin-Tgz/CodeCity/tar.gz/refs/heads/main' }
}
New-Item -ItemType Directory -Path $appPrefix -Force | Out-Null
# Make the chosen runtime available to npm and its child processes in this session.
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH
& $nodeExe $npmCli install --global --prefix $appPrefix --omit=dev --no-audit --no-fund -- $PackageSpec
if ($LASTEXITCODE -ne 0) { throw 'CodeCity package installation failed.' }
$cliPath = Join-Path $appPrefix 'node_modules\codecity-viewer\server\cli.cjs'
if (-not (Test-Path -LiteralPath $cliPath)) { throw 'Installed package does not contain the CodeCity launcher.' }
$launcher = Join-Path $installRoot 'codecity.cmd'
[IO.File]::WriteAllText($launcher, "@echo off`r`n`"$nodeExe`" `"$cliPath`" %*`r`n", [Text.Encoding]::Default)
$userPath = [string][Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $NoPath -and @($userPath -split ';') -notcontains $installRoot) {
    [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $installRoot).TrimStart(';'), 'User')
}
Write-Host "CodeCity installed. In a new terminal, run: codecity"
if (-not $NoLaunch) { & $nodeExe $cliPath; if ($LASTEXITCODE -ne 0) { throw 'CodeCity exited with an error.' } }
