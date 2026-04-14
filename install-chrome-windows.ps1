[CmdletBinding()]
param(
    [string]$RepoOwner = "eliaspc2",
    [string]$RepoName = "human-activity-extension",
    [string]$InstallDir = "$env:LOCALAPPDATA\Human Activity Extension\chrome-unpacked"
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message)
    Write-Host "[human-activity-windows] $Message"
}

function Get-ChromeExecutable {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($candidates.Count -gt 0) {
        return $candidates[0]
    }

    return $null
}

if (-not $IsWindows) {
    throw "This helper is for Windows only."
}

$downloadUrl = "https://github.com/$RepoOwner/$RepoName/releases/latest/download/human-activity-extension-universal.zip"
$tempRoot = Join-Path $env:TEMP ("human-activity-extension-" + [guid]::NewGuid().Guid)
$zipPath = Join-Path $tempRoot "human-activity-extension-universal.zip"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    Write-Log "Downloading latest package from GitHub"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath

    Write-Log "Preparing extracted extension folder at $InstallDir"
    if (Test-Path $InstallDir) {
        Remove-Item -Path $InstallDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force

    $chromeExe = Get-ChromeExecutable
    if ($chromeExe) {
        Start-Process -FilePath $chromeExe -ArgumentList "chrome://extensions/"
    }
    else {
        Start-Process "chrome://extensions/"
    }

    Start-Process explorer.exe $InstallDir

    Write-Host ""
    Write-Host "Human Activity Extension is ready for Chrome on Windows."
    Write-Host ""
    Write-Host "Next steps in Chrome:"
    Write-Host "  1. Turn on Developer mode."
    Write-Host "  2. Click 'Load unpacked'."
    Write-Host "  3. Select this folder:"
    Write-Host "     $InstallDir"
    Write-Host ""
    Write-Host "Chrome on Windows does not support direct self-hosted one-click installs"
    Write-Host "outside managed environments, so this helper prepares everything up to"
    Write-Host "the last click."
}
finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Path $tempRoot -Recurse -Force
    }
}
