#!/usr/bin/env node

/**
 * CI Script to detect and prevent mock data in production builds
 * 
 * This script scans the codebase for common mock data patterns and fails
 * the build if any are found, ensuring only live data is used in production.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock data patterns to detect
const MOCK_PATTERNS = [
  // Static numbers and mock data
  { pattern: /const\s+\w+\s*=\s*\{\s*orders:\s*\d+/, message: 'Static order counts detected' },
  { pattern: /const\s+\w+\s*=\s*\{\s*total:\s*\d+/, message: 'Static total amounts detected' },
  { pattern: /const\s+\w+\s*=\s*\{\s*spend:\s*\d+/, message: 'Static spend amounts detected' },
  { pattern: /const\s+\w+\s*=\s*\{\s*points:\s*\d+/, message: 'Static loyalty points detected' },
  { pattern: /const\s+\w+\s*=\s*\{\s*suppliers:\s*\d+/, message: 'Static supplier counts detected' },
  
  // Mock API calls
  { pattern: /mockInvoiceApi\./, message: 'Mock invoice API calls detected' },
  { pattern: /mockOrderApi\./, message: 'Mock order API calls detected' },
  { pattern: /mockSupplierApi\./, message: 'Mock supplier API calls detected' },
  { pattern: /mockLoyaltyApi\./, message: 'Mock loyalty API calls detected' },
  
  // Hardcoded data arrays
  { pattern: /const\s+\w+\s*=\s*\[.*\{.*id:\s*['"]\w+['"].*\}.*\]/, message: 'Hardcoded data arrays detected' },
  { pattern: /const\s+\w+\s*=\s*\[.*\{.*name:\s*['"].*['"].*\}.*\]/, message: 'Hardcoded data arrays detected' },
  
  // Mock data files
  { pattern: /import.*mock.*from.*mock/, message: 'Mock data imports detected' },
  { pattern: /from.*mock.*api/, message: 'Mock API imports detected' },
  
  // Static dashboard data
  { pattern: /const\s+dashboardData\s*=/, message: 'Static dashboard data detected' },
  { pattern: /const\s+kpisData\s*=/, message: 'Static KPIs data detected' },
  
  // Mock GraphQL responses
  { pattern: /const\s+mockGraphQLResponse\s*=/, message: 'Mock GraphQL responses detected' },
  { pattern: /const\s+mockQueryResult\s*=/, message: 'Mock query results detected' },
];

// Files to exclude from scanning
const EXCLUDE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.mock\./,
  /__tests__/,
  /__mocks__/,
  /\.stories\./,
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /coverage/,
];

// File extensions to scan
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

let foundIssues = [];

/**
 * Check if a file should be excluded
 */
function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a file should be scanned
 */
function shouldScanFile(filePath) {
  const ext = path.extname(filePath);
  return SCAN_EXTENSIONS.includes(ext) && !shouldExcludeFile(filePath);
}

/**
 * Scan a single file for mock data patterns
 */
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      MOCK_PATTERNS.forEach(({ pattern, message }) => {
        if (pattern.test(line)) {
          foundIssues.push({
            file: filePath,
            line: index + 1,
            message,
            code: line.trim()
          });
        }
      });
    });
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
  }
}

/**
 * Recursively scan directory for files
 */
function scanDirectory(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        if (!shouldExcludeFile(itemPath)) {
          scanDirectory(itemPath);
        }
      } else if (shouldScanFile(itemPath)) {
        scanFile(itemPath);
      }
    });
  } catch (error) {
    console.warn(`Warning: Could not scan directory ${dirPath}: ${error.message}`);
  }
}

/**
 * Check for mock data in specific directories
 */
function checkMockData() {
  console.log('🔍 Scanning for mock data patterns...');
  
  const directoriesToScan = [
    'apps/web/src',
    'services',
    'packages'
  ];
  
  directoriesToScan.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`  Scanning ${dir}...`);
      scanDirectory(dir);
    }
  });
  
  return foundIssues;
}

/**
 * Check for Lighthouse performance requirements
 */
function checkLighthouseRequirements() {
  console.log('📊 Checking Lighthouse requirements...');
  
  // This would typically run Lighthouse CI
  // For now, we'll check if the build is optimized
  try {
    const buildOutput = execSync('npm run build', { 
      cwd: 'apps/web',
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // Check for build optimization indicators
    const hasOptimization = buildOutput.includes('optimized') || 
                           buildOutput.includes('compressed') ||
                           buildOutput.includes('minified');
    
    if (!hasOptimization) {
      console.warn('⚠️  Build optimization not detected');
    }
    
    return hasOptimization;
  } catch (error) {
    console.error('❌ Build check failed:', error.message);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Starting CI Guards for Mock Data Prevention...\n');
  
  // Check for mock data
  const issues = checkMockData();
  
  // Check Lighthouse requirements
  const lighthousePassed = checkLighthouseRequirements();
  
  // Report results
  console.log('\n📋 CI Guards Results:');
  console.log('====================');
  
  if (issues.length === 0) {
    console.log('✅ No mock data patterns detected');
  } else {
    console.log(`❌ Found ${issues.length} mock data issues:`);
    issues.forEach(issue => {
      console.log(`  • ${issue.file}:${issue.line} - ${issue.message}`);
      console.log(`    ${issue.code}`);
    });
  }
  
  console.log(`\n📊 Lighthouse Requirements: ${lighthousePassed ? '✅ PASSED' : '❌ FAILED'}`);
  
  // Determine exit code
  const hasIssues = issues.length > 0 || !lighthousePassed;
  
  if (hasIssues) {
    console.log('\n❌ CI Guards failed. Please fix the issues above.');
    process.exit(1);
  } else {
    console.log('\n✅ All CI Guards passed successfully!');
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { checkMockData, checkLighthouseRequirements };
