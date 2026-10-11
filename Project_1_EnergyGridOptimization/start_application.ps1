param(
    [ValidateRange(1, 65535)][int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$python = Join-Path $project '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Project Python environment is missing: $python"
}

Push-Location -LiteralPath $project
try {
    if ($NoBrowser) {
        & $python -m application.server --port $Port
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        return
    }

    $probe = [System.Net.Sockets.TcpClient]::new()
    try {
        try {
            $probe.Connect('127.0.0.1', $Port)
        } catch [System.Net.Sockets.SocketException] {
            if ($_.Exception.SocketErrorCode -ne [System.Net.Sockets.SocketError]::ConnectionRefused) {
                throw "Cannot start application on 127.0.0.1:${Port}: $($_.Exception.Message)"
            }
        }
        if ($probe.Connected) {
            throw "Cannot start application on 127.0.0.1:${Port}: port is already in use."
        }
    } finally {
        $probe.Dispose()
    }

    $runLog = Join-Path $project ("results\application-launch-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runLog | Out-Null
    $stdout = Join-Path $runLog 'stdout.log'
    $stderr = Join-Path $runLog 'stderr.log'
    $server = Start-Process -FilePath $python -ArgumentList @('-m', 'application.server', '--port', "$Port") `
        -WorkingDirectory $project -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try {
        $url = "http://127.0.0.1:$Port/"
        $ready = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            $server.Refresh()
            if ($server.HasExited) { break }
            try {
                $config = Invoke-RestMethod -Uri ($url + 'api/config') -TimeoutSec 1
                $ownStartup = if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw } else { '' }
                if ($null -ne $config.default_controls -and $null -ne $config.base_case -and
                    $ownStartup.Contains("Application listening at $url")) {
                    $server.Refresh()
                    if ($server.HasExited) { break }
                    $ready = $true
                    break
                }
            } catch { }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) {
            $detail = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { '' }
            throw "Application could not start on 127.0.0.1:$Port. $detail"
        }
        Start-Process -FilePath $url
        Write-Host "Application listening at $url"
        $server.WaitForExit()
        $server.Refresh()
        if ($server.ExitCode -ne 0) {
            $detail = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { '' }
            throw "Application exited with code $($server.ExitCode). $detail"
        }
    } finally {
        $server.Refresh()
        if (-not $server.HasExited) { Stop-Process -Id $server.Id }
    }
} finally {
    Pop-Location
}
