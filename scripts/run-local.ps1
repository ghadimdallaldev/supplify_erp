# Run the full Supplify stack locally via Docker Compose (Windows / PowerShell).
# Usage:
#   .\scripts\run-local.ps1
#   .\scripts\run-local.ps1 up
#   .\scripts\run-local.ps1 down
#   .\scripts\run-local.ps1 up --logs   # start then stream all container logs
#   .\scripts\run-local.ps1 logs api    # follow one service only
#   .\scripts\run-local.ps1 status
#   .\scripts\run-local.ps1 seed

param(
    [Parameter(Position = 0)]
    [string]$Command = "up",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoRoot "docker\.env"
$EnvExample = Join-Path $RepoRoot "docker\.env.example"
$ComposeFile = Join-Path $RepoRoot "docker-compose.yml"

function Invoke-Dc {
    param([string[]]$ComposeArgs)
    & docker compose --env-file $EnvFile -f $ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Read-EnvFile {
    $vars = @{}
    if (-not (Test-Path $EnvFile)) { return $vars }
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $k, $v = $_ -split '=', 2
        $vars[$k.Trim()] = $v.Trim()
    }
    return $vars
}

function Get-EnvVal {
    param([hashtable]$Vars, [string]$Key, [string]$Default)
    if ($Vars.ContainsKey($Key) -and $Vars[$Key]) { return $Vars[$Key] }
    return $Default
}

function Set-EnvVal {
    param([string]$Key, [string]$Value)
    $lines = @()
    $found = $false
    if (Test-Path $EnvFile) {
        $lines = Get-Content $EnvFile
        $lines = $lines | ForEach-Object {
            if ($_ -match "^$([regex]::Escape($Key))=") {
                $found = $true
                "$Key=$Value"
            } else { $_ }
        }
    }
    if (-not $found) { $lines += "$Key=$Value" }
    $lines | Set-Content -Path $EnvFile -Encoding utf8
}

function Test-PortInUse {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return $null -ne $conn
    } catch {
        $r = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
        return $r.TcpTestSucceeded
    }
}

function Test-OurContainerOnPort {
    param([int]$Port, [string]$Name)
    $ports = docker ps --filter "name=^/${Name}$" --format "{{.Ports}}" 2>$null
    return $ports -match ":${Port}->"
}

function Wait-Healthy {
    param([string]$Container, [int]$Max = 60, [int]$SleepSec = 3)
    Write-Host -NoNewline "Waiting for $Container to be healthy"
    for ($i = 1; $i -le $Max; $i++) {
        $status = docker inspect --format "{{.State.Health.Status}}" $Container 2>$null
        if ($status -eq "healthy") {
            Write-Host " OK"
            return $true
        }
        Write-Host -NoNewline "."
        Start-Sleep -Seconds $SleepSec
    }
    Write-Host " TIMEOUT"
    docker logs $Container --tail 20 2>&1
    return $false
}

function Test-HttpOk {
    param([string]$Url)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return $r.StatusCode -ge 200 -and $r.StatusCode -lt 400
    } catch { return $false }
}

function Ensure-Env {
    & node (Join-Path $RepoRoot "scripts\ensure-docker-env.mjs")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $script:vars = Read-EnvFile
}

function Get-Urls {
    $v = Read-EnvFile
    $script:AppUrl = Get-EnvVal $v "WEB_ORIGIN" "http://localhost"
    $kc = Get-EnvVal $v "KEYCLOAK_PORT" "8180"
    $script:KcUrl = "http://localhost:$kc"
    $minio = Get-EnvVal $v "MINIO_CONSOLE_PORT" "9001"
    $script:MinioUrl = "http://localhost:$minio"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not on PATH."
}
docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Compose plugin is required."
}

$cmd = $Command.ToLower()
if ($cmd -eq "start") { $cmd = "up" }
if ($cmd -eq "stop") { $cmd = "down" }
if ($cmd -eq "ps") { $cmd = "status" }

if ($cmd -eq "up") {
    $followLogs = $true
    $logServices = @("api")
    $upArgs = @()
    foreach ($a in $RemainingArgs) {
        if ($a -in "--logs", "-f", "--follow") { $followLogs = $true }
        elseif ($a -eq "--no-logs") { $followLogs = $false }
        elseif ($a -eq "--all-logs") { $logServices = @() }
        elseif ($a -in "api", "web", "nginx", "keycloak", "postgres", "redis", "minio") { $logServices = @($a) }
        else { $upArgs += $a }
    }

    $buildArgs = @("up", "-d", "--build", "--profile", "full")
    if ($upArgs -contains "--no-build") {
        $buildArgs = @("up", "-d", "--profile", "full")
        $upArgs = $upArgs | Where-Object { $_ -ne "--no-build" }
    }

    Ensure-Env
    Write-Host "Syncing apps/api/.env.docker-sync from docker/.env (native migrations + pnpm dev)..."
    & node (Join-Path $RepoRoot "scripts\ensure-native-env.mjs")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Starting Supplify stack..."
    Invoke-Dc $buildArgs

    Write-Host ""
    Write-Host "Waiting for core services..."
    [void](Wait-Healthy "supplify-postgres" 40 3)
    [void](Wait-Healthy "supplify-redis" 30 2)
    Wait-Healthy "supplify-api" 60 5 | Out-Null
    Wait-Healthy "supplify-web" 40 3 | Out-Null
    Wait-Healthy "supplify-nginx" 30 3 | Out-Null

    Get-Urls
    Write-Host ""
    Write-Host "=========================================================="
    Write-Host "  Supplify is running locally"
    Write-Host "=========================================================="
    Write-Host "  App (nginx):     $AppUrl"
    Write-Host "  API health:      $AppUrl/health"
    Write-Host "  Keycloak:        $KcUrl  (realm: Supplify)"
    Write-Host "  Keycloak admin:  $KcUrl/admin"
    Write-Host "  MinIO console:   $MinioUrl"
    Write-Host ""
    Write-Host "  Logs:    scripts\run-local.cmd logs"
    Write-Host "  Stop:    scripts\run-local.cmd down"
    Write-Host "  Seed DB: scripts\run-local.cmd seed"
    Write-Host "=========================================================="

    if (-not (Test-HttpOk "$AppUrl/health")) {
        Write-Host ""
        Write-Host "WARN: $AppUrl/health did not respond yet - stack may still be warming up."
    }

    if ($followLogs) {
        Write-Host ""
        Write-Host "Following API logs (Ctrl+C stops watching; app keeps running)..."
        Write-Host "  Tip: scripts\run-local.cmd up --all-logs  for every service"
        if ($logServices.Count -gt 0) {
            Invoke-Dc (@("logs", "-f") + $logServices)
        } else {
            Invoke-Dc @("logs", "-f")
        }
    }
}
elseif ($cmd -eq "down") {
    Ensure-Env
    Invoke-Dc (@("down") + $RemainingArgs)
    Write-Host "Stack stopped."
}
elseif ($cmd -eq "logs") {
    Ensure-Env
    Invoke-Dc (@("logs", "-f") + $RemainingArgs)
}
elseif ($cmd -eq "status") {
    Ensure-Env
    Get-Urls
    Write-Host "Containers:"
    Invoke-Dc @("ps")
    Write-Host ""
    Write-Host "HTTP checks:"
    foreach ($pair in @(
        @("nginx", "$AppUrl/nginx-health"),
        @("api", "$AppUrl/health"),
        @("keycloak", "$KcUrl/realms/Supplify")
    )) {
        $label, $url = $pair
        if (Test-HttpOk $url) {
            Write-Host "  ${label}: OK  ($url)"
        } else {
            Write-Host "  ${label}: not ready  ($url)"
        }
    }
}
elseif ($cmd -eq "infra") {
    Ensure-Env
    node (Join-Path $RepoRoot "scripts\dev-infra.mjs")
}
elseif ($cmd -eq "dev") {
    Ensure-Env
    node (Join-Path $RepoRoot "scripts\dev-native.mjs") @RemainingArgs
}
elseif ($cmd -eq "seed") {
    Ensure-Env
    node (Join-Path $RepoRoot "scripts\ensure-native-env.mjs")
    docker inspect supplify-api *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Running full feature seed (migrations + prod-like data + chats + Keycloak)..."
        docker exec -e ALLOW_PRODLIKE_SEED=true -e KEYCLOAK_BASE_URL=http://keycloak:8080 -e KEYCLOAK_ADMIN_PASSWORD=admin supplify-api node apps/api/scripts/seed-full.mjs
    } else {
        Write-Host "API container not running — full feature seed via host Node/pnpm..."
        node (Join-Path $RepoRoot "scripts\dev-infra.mjs")
        npx --yes pnpm@8.15.9 seed:full
    }
    Write-Host "Bootstrap finished. Log in as restaurant@supplify.com / SupplifyRestaurant1!"
}
elseif ($cmd -eq "restart") {
    Ensure-Env
    Invoke-Dc (@("restart") + $RemainingArgs)
}
elseif ($cmd -eq "build") {
    Ensure-Env
    Invoke-Dc (@("build") + $RemainingArgs)
}
elseif ($cmd -eq "help" -or $cmd -eq "-h" -or $cmd -eq "--help") {
    Get-Content $PSCommandPath | Select-Object -Skip 1 -First 8
}
else {
    Write-Error "Unknown command: $Command. Run: scripts\run-local.cmd help"
}
