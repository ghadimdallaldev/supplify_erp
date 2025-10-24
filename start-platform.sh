#!/bin/bash

# Supplify Platform Startup Script
# This script kills old processes, cleans up, and starts all services including Keycloak

set -e

echo "🚀 Starting Supplify Platform with Keycloak Authentication..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to kill processes by port
kill_port() {
    local port=$1
    local process_name=$2
    
    print_status "Checking for processes on port $port..."
    
    if command -v netstat >/dev/null 2>&1; then
        # Windows
        local pids=$(netstat -ano | findstr ":$port " | awk '{print $5}' | sort -u)
        if [ ! -z "$pids" ]; then
            print_warning "Found processes on port $port, killing..."
            for pid in $pids; do
                if [ "$pid" != "0" ] && [ "$pid" != "" ]; then
                    taskkill //F //PID $pid 2>/dev/null || true
                fi
            done
            print_success "Killed processes on port $port"
        else
            print_success "Port $port is free"
        fi
    elif command -v lsof >/dev/null 2>&1; then
        # macOS/Linux
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            print_warning "Found processes on port $port, killing..."
            kill -9 $pids 2>/dev/null || true
            print_success "Killed processes on port $port"
        else
            print_success "Port $port is free"
        fi
    fi
}

# Function to check Docker
check_docker() {
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker first."
        print_status "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        print_status "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    print_success "Docker and Docker Compose are available"
}

# Function to start Keycloak
start_keycloak() {
    print_status "Starting Keycloak authentication service..."
    
    cd infra/keycloak
    
    # Check if Keycloak is already running
    if docker-compose ps | grep -q "keycloak.*Up"; then
        print_success "Keycloak is already running"
    else
        print_status "Starting Keycloak containers..."
        docker-compose up -d
        
        # Wait for Keycloak to be ready
        print_status "Waiting for Keycloak to be ready..."
        local max_attempts=30
        local attempt=0
        
        while [ $attempt -lt $max_attempts ]; do
            if curl -s http://localhost:8080/health/ready >/dev/null 2>&1; then
                print_success "Keycloak is ready!"
                break
            fi
            
            attempt=$((attempt + 1))
            print_status "Waiting for Keycloak... (attempt $attempt/$max_attempts)"
            sleep 5
        done
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Keycloak failed to start within expected time"
            return 1
        fi
    fi
    
    cd ../..
}

# Function to seed Keycloak
seed_keycloak() {
    print_status "Seeding Keycloak with Supplify configuration..."
    
    # Check if seeding is needed
    if curl -s "http://localhost:8080/realms/Supplify" >/dev/null 2>&1; then
        print_success "Supplify realm already exists"
    else
        print_status "Running Keycloak seeding script..."
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            print_status "Installing dependencies for Keycloak seeding..."
            if command_exists pnpm; then
                pnpm install
            elif command_exists yarn; then
                yarn install
            else
                npm install
            fi
        fi
        
        # Run seeding script
        if command_exists pnpm; then
            pnpm exec ts-node scripts/keycloak-seed.ts
        elif command_exists yarn; then
            yarn exec ts-node scripts/keycloak-seed.ts
        else
            npx ts-node scripts/keycloak-seed.ts
        fi
        
        print_success "Keycloak seeded successfully"
    fi
}

# Function to kill Node.js processes
kill_node_processes() {
    print_status "Cleaning up old Node.js processes..."
    
    if command -v tasklist >/dev/null 2>&1; then
        # Windows
        local node_count=$(tasklist | findstr node.exe | wc -l)
        if [ "$node_count" -gt 0 ]; then
            print_warning "Found $node_count Node.js processes, killing..."
            taskkill //F //IM node.exe 2>/dev/null || true
            print_success "Killed all Node.js processes"
        else
            print_success "No Node.js processes found"
        fi
    elif command -v pgrep >/dev/null 2>&1; then
        # macOS/Linux
        local node_count=$(pgrep -f node | wc -l)
        if [ "$node_count" -gt 0 ]; then
            print_warning "Found $node_count Node.js processes, killing..."
            pkill -f node 2>/dev/null || true
            print_success "Killed all Node.js processes"
        else
            print_success "No Node.js processes found"
        fi
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install dependencies if needed
install_deps() {
    local dir=$1
    local name=$2
    
    print_status "Checking dependencies for $name..."
    
    if [ ! -d "$dir/node_modules" ]; then
        print_warning "Dependencies not found for $name, installing..."
        cd "$dir"
        if command_exists pnpm; then
            pnpm install
        elif command_exists yarn; then
            yarn install
        else
            npm install
        fi
        cd - > /dev/null
        print_success "Dependencies installed for $name"
    else
        print_success "Dependencies already installed for $name"
    fi
}

# Function to start service
start_service() {
    local dir=$1
    local name=$2
    local port=$3
    local command=$4
    
    print_status "Starting $name on port $port..."
    
    cd "$dir"
    
    # Start in background
    if command_exists pnpm; then
        pnpm $command > "../../logs/${name}.log" 2>&1 &
    elif command_exists yarn; then
        yarn $command > "../../logs/${name}.log" 2>&1 &
    else
        npm run $command > "../../logs/${name}.log" 2>&1 &
    fi
    
    local pid=$!
    echo $pid > "../../logs/${name}.pid"
    
    cd - > /dev/null
    
    # Wait a moment and check if it started
    sleep 3
    
    if kill -0 $pid 2>/dev/null; then
        print_success "$name started successfully (PID: $pid)"
    else
        print_error "Failed to start $name"
        return 1
    fi
}

# Main execution
main() {
    print_status "=== Supplify Platform Startup ==="
    
    # Create logs directory
    mkdir -p logs
    
    # Kill old processes
    print_status "Step 1: Cleaning up old processes..."
    kill_node_processes
    kill_port 3000 "Web App"
    kill_port 4000 "API Gateway"
    kill_port 8080 "Keycloak"
    kill_port 5432 "PostgreSQL"
    kill_port 6379 "Redis"
    kill_port 5672 "RabbitMQ"
    
    # Wait for cleanup
    sleep 2
    
    # Check for required tools
    print_status "Step 2: Checking required tools..."
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check Docker for Keycloak
    check_docker
    
    print_success "Required tools are available"
    
    # Install dependencies
    print_status "Step 3: Installing dependencies..."
    install_deps "apps/web" "Web App"
    install_deps "apps/api-gateway" "API Gateway"
    
    # Start Keycloak
    print_status "Step 4: Starting Keycloak authentication service..."
    start_keycloak
    
    # Seed Keycloak
    print_status "Step 5: Configuring Keycloak..."
    seed_keycloak
    
    # Start services
    print_status "Step 6: Starting application services..."
    
    # Start Web App
    start_service "apps/web" "web" 3000 "dev"
    
    # Start API Gateway (if it exists)
    if [ -d "apps/api-gateway" ]; then
        start_service "apps/api-gateway" "api-gateway" 4000 "start:dev"
    fi
    
    # Wait for services to start
    print_status "Step 7: Waiting for services to initialize..."
    sleep 5
    
    # Check if services are running
    print_status "Step 8: Verifying services..."
    
    # Check Keycloak
    if curl -s http://localhost:8080/health/ready >/dev/null 2>&1; then
        print_success "✅ Keycloak is running on http://localhost:8080"
    else
        print_error "❌ Keycloak failed to start"
    fi
    
    # Check Web App
    if netstat -an | grep -q ":3000.*LISTENING" 2>/dev/null || lsof -i:3000 >/dev/null 2>&1; then
        print_success "✅ Web App is running on http://localhost:3000"
    else
        print_error "❌ Web App failed to start"
    fi
    
    # Check API Gateway
    if [ -d "apps/api-gateway" ]; then
        if netstat -an | grep -q ":4000.*LISTENING" 2>/dev/null || lsof -i:4000 >/dev/null 2>&1; then
            print_success "✅ API Gateway is running on http://localhost:4000"
        else
            print_warning "⚠️ API Gateway may not be running"
        fi
    fi
    
    print_success "=== Supplify Platform Started Successfully ==="
    print_status "🔐 Keycloak Admin: http://localhost:8080 (admin/admin_password)"
    print_status "🌐 Web App: http://localhost:3000"
    print_status "📊 Admin Dashboard: http://localhost:3000/admin/dashboard"
    print_status "📝 Test Data Manager: http://localhost:3000/admin/test-data"
    print_status "📋 Logs: ./logs/"
    
    print_status ""
    print_status "🔑 Authentication Setup:"
    print_status "   - Keycloak handles all authentication and authorization"
    print_status "   - Users register via Keycloak self-service"
    print_status "   - Admin approval required for access"
    print_status "   - Multi-tenant with client ID scoping"
    
    print_status ""
    print_status "To stop all services, run: ./stop-platform.sh"
}

# Run main function
main "$@"
