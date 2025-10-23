# Supplify Daily Commit Script (PowerShell)
Write-Host "Supplify Daily Commit - $(Get-Date)" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green

# Check if there are changes
$gitStatus = git status --porcelain
if (-not $gitStatus) {
    Write-Host "No changes to commit" -ForegroundColor Green
    exit 0
}

# Add all changes
Write-Host "Adding changes..." -ForegroundColor Cyan
git add .

# Create commit with timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMsg = "Daily commit: $timestamp`n`n- Platform updates and improvements`n- Bug fixes and optimizations`n- Feature enhancements`n- Documentation updates`n`nAuto-generated commit for Supplify platform maintenance"

git commit -m $commitMsg

# Push to GitHub
Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

Write-Host "Daily commit completed successfully!" -ForegroundColor Green
$commitHash = git rev-parse HEAD
Write-Host "Commit hash: $commitHash" -ForegroundColor Gray
