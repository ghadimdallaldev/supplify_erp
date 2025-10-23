# Supplify Platform Startup Script (PowerShell)
# This script kills old processes, cleans up, and starts all services

Write-Host "🚀 Starting Supplify Platform..." -ForegroundColor Green

# Function to print colored output
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to kill processes by port
function Kill-Port {
    param([int]$Port, [string]$ProcessName)
    
    Write-Info "Checking for processes on port $Port..."
    
    $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($processes) {
        Write-Warning "Found processes on port $Port, killing..."
        foreach ($process in $processes) {
            $pid = $process.OwningProcess
            if ($pid -and $pid -ne 0) {
                try {
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Write-Host "SUCCESS: The process with PID $pid has been terminated." -ForegroundColor Green
                } catch {
                    # Ignore errors
                }
            }
        }
        Write-Success "Killed processes on port $Port"
    } else {
        Write-Success "Port $Port is free"
    }
}

# Function to kill Node.js processes
function Kill-NodeProcesses {
    Write-Info "Cleaning up old Node.js processes..."
    
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Warning "Found $($nodeProcesses.Count) Node.js processes, killing..."
        $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Success "Killed all Node.js processes"
    } else {
        Write-Success "No Node.js processes found"
    }
}

# Function to install dependencies if needed
function Install-Dependencies {
    param([string]$Dir, [string]$Name)
    
    Write-Info "Checking dependencies for $Name..."
    
    if (-not (Test-Path "$Dir/node_modules")) {
        Write-Warning "Dependencies not found for $Name, installing..."
        Push-Location $Dir
        try {
            if (Get-Command pnpm -ErrorAction SilentlyContinue) {
                pnpm install
            } elseif (Get-Command yarn -ErrorAction SilentlyContinue) {
                yarn install
            } else {
                npm install
            }
            Write-Success "Dependencies installed for $Name"
        } finally {
            Pop-Location
        }
    } else {
        Write-Success "Dependencies already installed for $Name"
    }
}

# Function to start service
function Start-Service {
    param([string]$Dir, [string]$Name, [int]$Port, [string]$Command)
    
    Write-Info "Starting $Name on port $Port..."
    
    Push-Location $Dir
    
    try {
        # Start in background
        $job = Start-Job -ScriptBlock {
            param($Command, $LogFile)
            if (Get-Command pnpm -ErrorAction SilentlyContinue) {
                pnpm $Command > $LogFile 2>&1
            } elseif (Get-Command yarn -ErrorAction SilentlyContinue) {
                yarn $Command > $LogFile 2>&1
            } else {
                npm run $Command > $LogFile 2>&1
            }
        } -ArgumentList $Command, "../../logs/${Name}.log"
        
        # Save job ID
        $job.Id | Out-File -FilePath "../../logs/${Name}.pid" -Encoding ASCII
        
        # Wait a moment and check if it started
        Start-Sleep -Seconds 3
        
        if ($job.State -eq "Running") {
            Write-Success "$Name started successfully (Job ID: $($job.Id))"
        } else {
            Write-Error "Failed to start $Name"
            return $false
        }
    } finally {
        Pop-Location
    }
    
    return $true
}

# Main execution
function Main {
    Write-Info "=== Supplify Platform Startup ==="
    
    # Create logs directory
    if (-not (Test-Path "logs")) {
        New-Item -ItemType Directory -Path "logs" | Out-Null
    }
    
    # Kill old processes
    Write-Info "Step 1: Cleaning up old processes..."
    Kill-NodeProcesses
    Kill-Port 3000 "Web App"
    Kill-Port 4000 "API Gateway"
    Kill-Port 5432 "PostgreSQL"
    Kill-Port 6379 "Redis"
    Kill-Port 5672 "RabbitMQ"
    
    # Wait for cleanup
    Start-Sleep -Seconds 2
    
    # Check for required tools
    Write-Info "Step 2: Checking required tools..."
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js is not installed. Please install Node.js first."
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "npm is not installed. Please install npm first."
        exit 1
    }
    
    Write-Success "Required tools are available"
    
    # Install dependencies
    Write-Info "Step 3: Installing dependencies..."
    Install-Dependencies "apps/web" "Web App"
    Install-Dependencies "apps/api-gateway" "API Gateway"
    
    # Start services
    Write-Info "Step 4: Starting services..."
    
    # Start Web App
    $webStarted = Start-Service "apps/web" "web" 3000 "dev"
    
    # Start API Gateway (if it exists)
    if (Test-Path "apps/api-gateway") {
        $apiStarted = Start-Service "apps/api-gateway" "api-gateway" 4000 "start:dev"
    }
    
    # Wait for services to start
    Write-Info "Step 5: Waiting for services to initialize..."
    Start-Sleep -Seconds 5
    
    # Check if services are running
    Write-Info "Step 6: Verifying services..."
    
    $webRunning = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($webRunning) {
        Write-Success "✅ Web App is running on http://localhost:3000"
    } else {
        Write-Error "❌ Web App failed to start"
    }
    
    if (Test-Path "apps/api-gateway") {
        $apiRunning = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
        if ($apiRunning) {
            Write-Success "✅ API Gateway is running on http://localhost:4000"
        } else {
            Write-Warning "⚠️ API Gateway may not be running"
        }
    }
    
    Write-Success "=== Supplify Platform Started Successfully ==="
    Write-Info "🌐 Web App: http://localhost:3000"
    Write-Info "📊 Admin Dashboard: http://localhost:3000/admin/dashboard"
    Write-Info "📝 Test Data Manager: http://localhost:3000/admin/test-data"
    Write-Info "📋 Logs: ./logs/"
    
    Write-Info "To stop all services, run: .\stop-platform.ps1"
}

# Run main function
Main