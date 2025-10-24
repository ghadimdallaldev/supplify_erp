# Supplify Platform Startup Script (PowerShell)
# This script kills old processes, cleans up, and starts all services including Keycloak

param(
    [switch]$SkipKeycloak,
    [switch]$SkipSeeding
)

Write-Host "🚀 Starting Supplify Platform with Keycloak Authentication..." -ForegroundColor Green

# Function to print colored output
function Write-Status {
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
function Stop-Port {
    param([int]$Port, [string]$ServiceName)
    
    Write-Status "Checking for processes on port $Port..."
    
    try {
        $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($processes) {
        Write-Warning "Found processes on port $Port, killing..."
            foreach ($pid in $processes) {
                if ($pid -ne 0) {
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                }
            }
            Write-Success "Killed processes on port $Port"
        } else {
            Write-Success "Port $Port is free"
        }
    } catch {
        Write-Success "Port $Port is free"
    }
}

# Function to check Docker
function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker is not installed. Please install Docker first."
        Write-Status "Visit: https://docs.docker.com/get-docker/"
        exit 1
    }
    
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-Error "Docker Compose is not installed. Please install Docker Compose first."
        Write-Status "Visit: https://docs.docker.com/compose/install/"
        exit 1
    }
    
    Write-Success "Docker and Docker Compose are available"
}

# Function to start Keycloak
function Start-Keycloak {
    Write-Status "Starting Keycloak authentication service..."
    
    Push-Location "infra/keycloak"
    
    try {
        # Check if Keycloak is already running
        $keycloakStatus = docker-compose ps | Select-String "keycloak.*Up"
        if ($keycloakStatus) {
            Write-Success "Keycloak is already running"
        } else {
            Write-Status "Starting Keycloak containers..."
            docker-compose up -d
            
            # Wait for Keycloak to be ready
            Write-Status "Waiting for Keycloak to be ready..."
            $maxAttempts = 30
            $attempt = 0
            
            do {
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:8080/health/ready" -TimeoutSec 5 -ErrorAction SilentlyContinue
                    if ($response.StatusCode -eq 200) {
                        Write-Success "Keycloak is ready!"
                        break
                    }
                } catch {
                    # Continue waiting
                }
                
                $attempt++
                Write-Status "Waiting for Keycloak... (attempt $attempt/$maxAttempts)"
                Start-Sleep -Seconds 5
            } while ($attempt -lt $maxAttempts)
            
            if ($attempt -eq $maxAttempts) {
                Write-Error "Keycloak failed to start within expected time"
                Pop-Location
                return $false
            }
        }
    } finally {
        Pop-Location
    }
    
    return $true
}

# Function to seed Keycloak
function Invoke-KeycloakSeeding {
    Write-Status "Seeding Keycloak with Supplify configuration..."
    
    # Check if seeding is needed
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/realms/Supplify" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Success "Supplify realm already exists"
            return
        }
    } catch {
        # Realm doesn't exist, proceed with seeding
    }
    
    Write-Status "Running Keycloak seeding script..."
    
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Status "Installing dependencies for Keycloak seeding..."
        if (Get-Command pnpm -ErrorAction SilentlyContinue) {
            pnpm install
        } elseif (Get-Command yarn -ErrorAction SilentlyContinue) {
            yarn install
        } else {
            npm install
        }
    }
    
    # Run seeding script
    Push-Location scripts
    try {
        if (Get-Command pnpm -ErrorAction SilentlyContinue) {
            pnpm exec node keycloak-seed.js
        } elseif (Get-Command yarn -ErrorAction SilentlyContinue) {
            yarn exec node keycloak-seed.js
    } else {
            node keycloak-seed.js
        }
    } finally {
        Pop-Location
    }
    
    Write-Success "Keycloak seeded successfully"
}

# Function to install dependencies
function Install-Dependencies {
    param([string]$Directory, [string]$Name)
    
    Write-Status "Checking dependencies for $Name..."
    
    if (-not (Test-Path "$Directory/node_modules")) {
        Write-Warning "Dependencies not found for $Name, installing..."
        Push-Location $Directory
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
    param([string]$Directory, [string]$Name, [int]$Port, [string]$Command)
    
    Write-Status "Starting $Name on port $Port..."
    
    Push-Location $Directory
    try {
        # Start in background
        if (Get-Command pnpm -ErrorAction SilentlyContinue) {
            $pnpmPath = (Get-Command pnpm).Source
            Start-Process -FilePath $pnpmPath -ArgumentList $Command -RedirectStandardOutput "../../logs/${Name}.log" -RedirectStandardError "../../logs/${Name}-error.log" -WindowStyle Hidden
        } elseif (Get-Command yarn -ErrorAction SilentlyContinue) {
            $yarnPath = (Get-Command yarn).Source
            Start-Process -FilePath $yarnPath -ArgumentList $Command -RedirectStandardOutput "../../logs/${Name}.log" -RedirectStandardError "../../logs/${Name}-error.log" -WindowStyle Hidden
        } else {
            $npmPath = (Get-Command npm).Source
            Start-Process -FilePath $npmPath -ArgumentList "run", $Command -RedirectStandardOutput "../../logs/${Name}.log" -RedirectStandardError "../../logs/${Name}-error.log" -WindowStyle Hidden
        }
        
        Write-Success "$Name started successfully"
    } finally {
        Pop-Location
    }
}

# Main execution
function Main {
    Write-Status "=== Supplify Platform Startup ==="
    
    # Create logs directory
    if (-not (Test-Path "logs")) {
        New-Item -ItemType Directory -Path "logs" | Out-Null
    }
    
    # Kill old processes
    Write-Status "Step 1: Cleaning up old processes..."
    Stop-Port 3000 "Web App"
    Stop-Port 4000 "API Gateway"
    Stop-Port 8080 "Keycloak"
    Stop-Port 5432 "PostgreSQL"
    Stop-Port 6379 "Redis"
    Stop-Port 5672 "RabbitMQ"
    
    # Wait for cleanup
    Start-Sleep -Seconds 2
    
    # Check for required tools
    Write-Status "Step 2: Checking required tools..."
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js is not installed. Please install Node.js first."
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "npm is not installed. Please install npm first."
        exit 1
    }
    
    # Check Docker for Keycloak
    if (-not $SkipKeycloak) {
        Test-Docker
    }
    
    Write-Success "Required tools are available"
    
    # Install dependencies
    Write-Status "Step 3: Installing dependencies..."
    Install-Dependencies "apps/web" "Web App"
    Install-Dependencies "apps/api-gateway" "API Gateway"
    
    # Start Keycloak
    if (-not $SkipKeycloak) {
        Write-Status "Step 4: Starting Keycloak authentication service..."
        if (-not (Start-Keycloak)) {
            Write-Error "Failed to start Keycloak"
            exit 1
        }
        
        # Seed Keycloak
        if (-not $SkipSeeding) {
            Write-Status "Step 5: Configuring Keycloak..."
            Invoke-KeycloakSeeding
        }
    }
    
    # Start services
    Write-Status "Step 6: Starting application services..."
    
    # Start Web App
    Start-Service "apps/web" "web" 3000 "dev"
    
    # Start API Gateway (if it exists)
    if (Test-Path "apps/api-gateway") {
        Start-Service "apps/api-gateway" "api-gateway" 4000 "start:dev"
    }
    
    # Wait for services to start
    Write-Status "Step 7: Waiting for services to initialize..."
    Start-Sleep -Seconds 5
    
    # Check if services are running
    Write-Status "Step 8: Verifying services..."
    
    # Check Keycloak
    if (-not $SkipKeycloak) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/health/ready" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Success "Keycloak is running on http://localhost:8080"
            } else {
                Write-Error "Keycloak failed to start"
            }
        } catch {
            Write-Error "Keycloak failed to start"
        }
    }
    
    # Check Web App
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Success "Web App is running on http://localhost:3000"
        } else {
            Write-Error "Web App failed to start"
        }
    } catch {
        Write-Error "Web App failed to start"
    }
    
    # Check API Gateway
    if (Test-Path "apps/api-gateway") {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:4000" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Success "API Gateway is running on http://localhost:4000"
            } else {
                Write-Warning "API Gateway may not be running"
            }
        } catch {
            Write-Warning "API Gateway may not be running"
        }
    }
    
    Write-Success "=== Supplify Platform Started Successfully ==="
    if (-not $SkipKeycloak) {
        Write-Status "Keycloak Admin: http://localhost:8080 (admin/admin_password)"
    }
    Write-Status "Web App: http://localhost:3000"
    Write-Status "Admin Dashboard: http://localhost:3000/admin/dashboard"
    Write-Status "Test Data Manager: http://localhost:3000/admin/test-data"
    Write-Status "Logs: ./logs/"
    
    Write-Status ""
    Write-Status "Authentication Setup:"
    Write-Status "   - Keycloak handles all authentication and authorization"
    Write-Status "   - Users register via Keycloak self-service"
    Write-Status "   - Admin approval required for access"
    Write-Status "   - Multi-tenant with client ID scoping"
    
    Write-Status ""
    Write-Status "To stop all services, run: ./stop-platform.ps1"
}

# Run main function
Main