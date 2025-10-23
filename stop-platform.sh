#!/bin/bash

# Supplify Platform Stop Script
# This script stops all running services and cleans up processes

set -e

echo "🛑 Stopping Supplify Platform..."

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

# Function to kill processes by PID file
kill_by_pid() {
    local service_name=$1
    local pid_file="logs/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping $service_name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                print_warning "Force killing $service_name..."
                kill -9 "$pid" 2>/dev/null || true
            fi
            print_success "$service_name stopped"
        else
            print_warning "$service_name was not running"
        fi
        rm -f "$pid_file"
    else
        print_warning "No PID file found for $service_name"
    fi
}

# Function to kill processes by port
kill_port() {
    local port=$1
    local service_name=$2
    
    print_status "Stopping services on port $port..."
    
    if command -v netstat >/dev/null 2>&1; then
        # Windows
        local pids=$(netstat -ano | findstr ":$port " | awk '{print $5}' | sort -u)
        if [ ! -z "$pids" ]; then
            for pid in $pids; do
                if [ "$pid" != "0" ] && [ "$pid" != "" ]; then
                    print_status "Killing process $pid on port $port..."
                    taskkill //F //PID $pid 2>/dev/null || true
                fi
            done
            print_success "$service_name stopped"
        else
            print_success "No processes found on port $port"
        fi
    elif command -v lsof >/dev/null 2>&1; then
        # macOS/Linux
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            print_status "Killing processes on port $port..."
            kill -9 $pids 2>/dev/null || true
            print_success "$service_name stopped"
        else
            print_success "No processes found on port $port"
        fi
    fi
}

# Function to kill all Node.js processes
kill_node_processes() {
    print_status "Stopping all Node.js processes..."
    
    if command -v tasklist >/dev/null 2>&1; then
        # Windows
        local node_count=$(tasklist | findstr node.exe | wc -l)
        if [ "$node_count" -gt 0 ]; then
            print_warning "Found $node_count Node.js processes, stopping..."
            taskkill //F //IM node.exe 2>/dev/null || true
            print_success "All Node.js processes stopped"
        else
            print_success "No Node.js processes found"
        fi
    elif command -v pgrep >/dev/null 2>&1; then
        # macOS/Linux
        local node_count=$(pgrep -f node | wc -l)
        if [ "$node_count" -gt 0 ]; then
            print_warning "Found $node_count Node.js processes, stopping..."
            pkill -f node 2>/dev/null || true
            print_success "All Node.js processes stopped"
        else
            print_success "No Node.js processes found"
        fi
    fi
}

# Main execution
main() {
    print_status "=== Stopping Supplify Platform ==="
    
    # Stop services by PID files
    print_status "Step 1: Stopping services by PID..."
    kill_by_pid "web"
    kill_by_pid "api-gateway"
    
    # Stop services by port
    print_status "Step 2: Stopping services by port..."
    kill_port 3000 "Web App"
    kill_port 4000 "API Gateway"
    
    # Kill any remaining Node.js processes
    print_status "Step 3: Cleaning up remaining processes..."
    kill_node_processes
    
    # Clean up log files
    print_status "Step 4: Cleaning up log files..."
    if [ -d "logs" ]; then
        rm -f logs/*.pid
        print_success "PID files cleaned up"
    fi
    
    print_success "=== Supplify Platform Stopped Successfully ==="
    print_status "All services have been stopped and processes cleaned up"
}

# Run main function
main "$@"
