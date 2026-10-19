param([Parameter(Mandatory=$true)][string]$PostgresBin)
$ErrorActionPreference = 'Stop'
$pgBin = (Resolve-Path -LiteralPath $PostgresBin).Path
foreach ($tool in 'initdb.exe','pg_ctl.exe','psql.exe') {
    if (-not (Test-Path -LiteralPath (Join-Path $pgBin $tool))) { throw "Missing PostgreSQL tool: $tool" }
}
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('pigweigh-pg-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRoot | Out-Null
$dataRoot = Join-Path $taskRoot 'data'
$passwordPath = Join-Path $taskRoot 'password.txt'
$password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
Set-Content -LiteralPath $passwordPath -Value $password -NoNewline
$database = 'pigweigh_test_' + [guid]::NewGuid().ToString('N')
$started = $false
$exitCode = 1
$savedDatabase = $env:PIGWEIGH_TEST_DATABASE_URL
$savedReset = $env:PIGWEIGH_TEST_ALLOW_RESET
$savedPassword = $env:PGPASSWORD
try {
    & (Join-Path $pgBin 'initdb.exe') -D $dataRoot -U pgtest --auth=scram-sha-256 --pwfile=$passwordPath --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    & (Join-Path $pgBin 'pg_ctl.exe') -D $dataRoot -l (Join-Path $taskRoot 'postgres.log') -o "-h 127.0.0.1 -p $port" -w start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
    $started = $true
    $env:PGPASSWORD = $password
    & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p $port -U pgtest -d postgres -c "CREATE DATABASE $database"
    if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed' }
    $env:PIGWEIGH_TEST_DATABASE_URL = "postgresql+psycopg://pgtest:${password}@127.0.0.1:$port/$database"
    $env:PIGWEIGH_TEST_ALLOW_RESET = $database
    Push-Location (Split-Path -Parent $PSScriptRoot)
    try {
        uv run pytest -q --tb=short
        $exitCode = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    if ($started) {
        & (Join-Path $pgBin 'pg_ctl.exe') -D $dataRoot -m fast -w stop
        if ($LASTEXITCODE -ne 0) { throw "Could not stop task-owned PostgreSQL; preserving $taskRoot" }
    }
    $env:PIGWEIGH_TEST_DATABASE_URL = $savedDatabase
    $env:PIGWEIGH_TEST_ALLOW_RESET = $savedReset
    $env:PGPASSWORD = $savedPassword
    $resolved = (Resolve-Path -LiteralPath $taskRoot).Path
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolved)).StartsWith('pigweigh-pg-test-')) {
        throw 'Refusing cleanup outside the task-owned temporary cluster'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
exit $exitCode
