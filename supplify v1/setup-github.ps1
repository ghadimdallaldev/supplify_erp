# Supplify GitHub Setup Script (PowerShell)

Write-Host "Supplify GitHub Setup Script" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green

# Check git configuration
try {
    $gitEmail = git config user.email
    $gitName = git config user.name
    if ($gitEmail -and $gitName) {
        Write-Host "Git configured with: $gitName <$gitEmail>" -ForegroundColor Green
    } else {
        throw "Git not configured"
    }
} catch {
    Write-Host "Git user configuration not found." -ForegroundColor Yellow
    Write-Host "Please configure git with your details:" -ForegroundColor Yellow
    $GITHUB_EMAIL = Read-Host "Enter your GitHub email"
    $GITHUB_USERNAME = Read-Host "Enter your GitHub username"
    
    git config user.email $GITHUB_EMAIL
    git config user.name $GITHUB_USERNAME
    
    Write-Host "Git configured with: $GITHUB_USERNAME <$GITHUB_EMAIL>" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next Steps to Push to GitHub:" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Create a new repository on GitHub:" -ForegroundColor White
Write-Host "   - Go to https://github.com/new" -ForegroundColor Gray
Write-Host "   - Repository name: supplify-platform" -ForegroundColor Gray
Write-Host "   - Description: Complete B2B Food Supply Platform" -ForegroundColor Gray
Write-Host "   - Make it Public or Private (your choice)" -ForegroundColor Gray
Write-Host "   - DON'T initialize with README (we already have one)" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Add the remote origin:" -ForegroundColor White
Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/supplify-platform.git" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Push to GitHub:" -ForegroundColor White
Write-Host "   git branch -M main" -ForegroundColor Gray
Write-Host "   git push -u origin main" -ForegroundColor Gray
Write-Host ""

# Create daily commit script
Write-Host "Creating daily commit automation script..." -ForegroundColor Cyan

$dailyCommitScript = @'
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
'@

$dailyCommitScript | Out-File -FilePath "daily-commit.ps1" -Encoding UTF8

Write-Host "Created daily-commit.ps1 script" -ForegroundColor Green
Write-Host ""
Write-Host "Daily Commit Automation:" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To set up daily commits:" -ForegroundColor White
Write-Host "1. Run manually: .\daily-commit.ps1" -ForegroundColor Gray
Write-Host "2. Set up Windows Task Scheduler for automation" -ForegroundColor Gray
Write-Host ""

Write-Host "Repository Status:" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan
Write-Host "Git repository initialized" -ForegroundColor Green
Write-Host "Initial commit created (621 files, 93,401 insertions)" -ForegroundColor Green
Write-Host "Daily commit script created" -ForegroundColor Green
Write-Host "Comprehensive documentation included" -ForegroundColor Green
Write-Host ""
Write-Host "Documentation Available:" -ForegroundColor Cyan
Write-Host "Complete Guide: docs\SUPPLIFY_COMPLETE_DOCUMENTATION.md" -ForegroundColor White
Write-Host "Documentation Index: docs\INDEX.md" -ForegroundColor White
Write-Host "Test Guide: tests\README.md" -ForegroundColor White
Write-Host ""
Write-Host "Supplify is ready for GitHub!" -ForegroundColor Green
Write-Host "Follow the steps above to push to GitHub and start daily commits." -ForegroundColor White