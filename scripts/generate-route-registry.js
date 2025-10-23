#!/usr/bin/env node

/**
 * Route Registry Generator
 * Scans Next.js app directory and generates a comprehensive route registry
 */

const fs = require('fs');
const path = require('path');

class RouteRegistry {
  constructor() {
    this.routes = new Map();
    this.links = new Set();
    this.buttons = new Set();
    this.errors = [];
  }

  scanAppDirectory(appDir) {
    console.log(`🔍 Scanning app directory: ${appDir}`);
    
    if (!fs.existsSync(appDir)) {
      this.errors.push(`App directory not found: ${appDir}`);
      return;
    }

    this.scanDirectory(appDir, '');
  }

  scanDirectory(dir, routePrefix) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip special Next.js directories
        if (['node_modules', '.next', 'dist', 'build'].includes(item)) {
          continue;
        }
        
        const newPrefix = routePrefix ? `${routePrefix}/${item}` : `/${item}`;
        this.scanDirectory(fullPath, newPrefix);
      } else if (item === 'page.tsx' || item === 'page.ts') {
        this.registerRoute(routePrefix || '/', fullPath);
      } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
        this.scanFileForLinks(fullPath);
      }
    }
  }

  registerRoute(route, filePath) {
    const routeInfo = {
      path: route,
      file: filePath,
      type: this.getRouteType(route),
      role: this.getRequiredRole(route),
      params: this.extractParams(route),
      middleware: this.getMiddleware(route),
      createdAt: new Date().toISOString()
    };

    this.routes.set(route, routeInfo);
    console.log(`📄 Registered route: ${route} (${filePath})`);
  }

  getRouteType(route) {
    if (route.startsWith('/admin')) return 'admin';
    if (route.startsWith('/supplier')) return 'supplier';
    if (route.startsWith('/restaurant')) return 'restaurant';
    if (route.startsWith('/api')) return 'api';
    return 'public';
  }

  getRequiredRole(route) {
    if (route.startsWith('/admin')) return 'admin';
    if (route.startsWith('/supplier')) return 'supplier';
    if (route.startsWith('/restaurant')) return 'restaurant';
    return null;
  }

  extractParams(route) {
    const params = [];
    const segments = route.split('/');
    
    for (const segment of segments) {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const paramName = segment.slice(1, -1);
        params.push(paramName);
      }
    }
    
    return params;
  }

  getMiddleware(route) {
    const middleware = [];
    
    if (route.startsWith('/admin')) {
      middleware.push('adminAuth', 'tenantContext');
    } else if (route.startsWith('/supplier') || route.startsWith('/restaurant')) {
      middleware.push('userAuth', 'tenantContext');
    } else if (route.startsWith('/api')) {
      middleware.push('apiAuth', 'tenantContext');
    }
    
    return middleware;
  }

  scanFileForLinks(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find href attributes
      const hrefMatches = content.match(/href=["']([^"']+)["']/g);
      if (hrefMatches) {
        hrefMatches.forEach(match => {
          const href = match.match(/href=["']([^"']+)["']/)[1];
          if (href.startsWith('/') && !href.startsWith('//')) {
            this.links.add(href);
          }
        });
      }

      // Find Link components
      const linkMatches = content.match(/<Link[^>]*href=["']([^"']+)["']/g);
      if (linkMatches) {
        linkMatches.forEach(match => {
          const href = match.match(/href=["']([^"']+)["']/)[1];
          if (href.startsWith('/') && !href.startsWith('//')) {
            this.links.add(href);
          }
        });
      }

      // Find router.push calls
      const routerMatches = content.match(/router\.push\(["']([^"']+)["']\)/g);
      if (routerMatches) {
        routerMatches.forEach(match => {
          const href = match.match(/router\.push\(["']([^"']+)["']\)/)[1];
          if (href.startsWith('/') && !href.startsWith('//')) {
            this.links.add(href);
          }
        });
      }

      // Find data-testid attributes for buttons
      const buttonMatches = content.match(/data-testid=["']([^"']*btn-[^"']*)["']/g);
      if (buttonMatches) {
        buttonMatches.forEach(match => {
          const testId = match.match(/data-testid=["']([^"']*)["']/)[1];
          this.buttons.add(testId);
        });
      }

    } catch (error) {
      this.errors.push(`Error scanning file ${filePath}: ${error.message}`);
    }
  }

  validateRoutes() {
    console.log('\n🔍 Validating routes...');
    
    const deadLinks = [];
    const missingRoutes = [];
    
    // Check if all links point to valid routes
    for (const link of this.links) {
      if (!this.isValidRoute(link)) {
        deadLinks.push(link);
      }
    }
    
    // Check for common missing routes
    const commonRoutes = [
      '/dashboard',
      '/profile',
      '/settings',
      '/help',
      '/support',
      '/privacy',
      '/terms'
    ];
    
    for (const route of commonRoutes) {
      if (!this.routes.has(route)) {
        missingRoutes.push(route);
      }
    }
    
    return {
      deadLinks,
      missingRoutes,
      totalRoutes: this.routes.size,
      totalLinks: this.links.size,
      totalButtons: this.buttons.size
    };
  }

  isValidRoute(link) {
    // Handle dynamic routes
    const routeSegments = link.split('/').filter(Boolean);
    const routePaths = Array.from(this.routes.keys());
    
    for (const routePath of routePaths) {
      if (this.matchesRoute(link, routePath)) {
        return true;
      }
    }
    
    return false;
  }

  matchesRoute(link, routePath) {
    if (link === routePath) return true;
    
    const linkSegments = link.split('/').filter(Boolean);
    const routeSegments = routePath.split('/').filter(Boolean);
    
    if (linkSegments.length !== routeSegments.length) return false;
    
    for (let i = 0; i < linkSegments.length; i++) {
      const linkSegment = linkSegments[i];
      const routeSegment = routeSegments[i];
      
      // Handle dynamic segments
      if (routeSegment.startsWith('[') && routeSegment.endsWith(']')) {
        continue; // Dynamic segment matches any value
      }
      
      if (linkSegment !== routeSegment) {
        return false;
      }
    }
    
    return true;
  }

  generateReport() {
    const validation = this.validateRoutes();
    
    const report = {
      summary: {
        totalRoutes: validation.totalRoutes,
        totalLinks: validation.totalLinks,
        totalButtons: validation.totalButtons,
        deadLinks: validation.deadLinks.length,
        missingRoutes: validation.missingRoutes.length,
        errors: this.errors.length,
        generatedAt: new Date().toISOString()
      },
      routes: Array.from(this.routes.entries()).map(([path, info]) => ({
        path,
        ...info
      })),
      links: Array.from(this.links),
      buttons: Array.from(this.buttons),
      issues: {
        deadLinks: validation.deadLinks,
        missingRoutes: validation.missingRoutes,
        errors: this.errors
      },
      recommendations: this.generateRecommendations(validation)
    };
    
    return report;
  }

  generateRecommendations(validation) {
    const recommendations = [];
    
    if (validation.deadLinks.length > 0) {
      recommendations.push({
        type: 'error',
        message: `Found ${validation.deadLinks.length} dead links`,
        action: 'Fix or remove dead links',
        links: validation.deadLinks
      });
    }
    
    if (validation.missingRoutes.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `Missing common routes: ${validation.missingRoutes.join(', ')}`,
        action: 'Consider adding these standard routes'
      });
    }
    
    if (this.errors.length > 0) {
      recommendations.push({
        type: 'error',
        message: `Found ${this.errors.length} scanning errors`,
        action: 'Review and fix file scanning issues'
      });
    }
    
    // Performance recommendations
    const routeCount = validation.totalRoutes;
    if (routeCount > 100) {
      recommendations.push({
        type: 'info',
        message: `Large number of routes (${routeCount})`,
        action: 'Consider route optimization and lazy loading'
      });
    }
    
    return recommendations;
  }

  saveReport(outputPath) {
    const report = this.generateReport();
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📊 Route registry saved to: ${outputPath}`);
    
    // Also save a human-readable version
    const humanReadablePath = outputPath.replace('.json', '.md');
    this.saveHumanReadableReport(humanReadablePath, report);
  }

  saveHumanReadableReport(outputPath, report) {
    let markdown = `# Route Registry Report\n\n`;
    markdown += `Generated: ${report.summary.generatedAt}\n\n`;
    
    markdown += `## Summary\n\n`;
    markdown += `- **Total Routes**: ${report.summary.totalRoutes}\n`;
    markdown += `- **Total Links**: ${report.summary.totalLinks}\n`;
    markdown += `- **Total Buttons**: ${report.summary.totalButtons}\n`;
    markdown += `- **Dead Links**: ${report.summary.deadLinks}\n`;
    markdown += `- **Missing Routes**: ${report.summary.missingRoutes}\n`;
    markdown += `- **Errors**: ${report.summary.errors}\n\n`;
    
    if (report.issues.deadLinks.length > 0) {
      markdown += `## 🚨 Dead Links\n\n`;
      report.issues.deadLinks.forEach(link => {
        markdown += `- \`${link}\`\n`;
      });
      markdown += `\n`;
    }
    
    if (report.issues.missingRoutes.length > 0) {
      markdown += `## ⚠️ Missing Routes\n\n`;
      report.issues.missingRoutes.forEach(route => {
        markdown += `- \`${route}\`\n`;
      });
      markdown += `\n`;
    }
    
    markdown += `## 📋 All Routes\n\n`;
    markdown += `| Path | Type | Role | Params | Middleware |\n`;
    markdown += `|------|------|------|--------|------------|\n`;
    
    report.routes.forEach(route => {
      markdown += `| \`${route.path}\` | ${route.type} | ${route.role || 'public'} | ${route.params.join(', ') || '-'} | ${route.middleware.join(', ') || '-'} |\n`;
    });
    
    markdown += `\n## 🔗 All Links\n\n`;
    report.links.forEach(link => {
      markdown += `- \`${link}\`\n`;
    });
    
    markdown += `\n## 🔘 All Buttons\n\n`;
    report.buttons.forEach(button => {
      markdown += `- \`${button}\`\n`;
    });
    
    if (report.recommendations.length > 0) {
      markdown += `\n## 💡 Recommendations\n\n`;
      report.recommendations.forEach(rec => {
        markdown += `### ${rec.type.toUpperCase()}: ${rec.message}\n\n`;
        markdown += `**Action**: ${rec.action}\n\n`;
        if (rec.links) {
          markdown += `**Links**: ${rec.links.join(', ')}\n\n`;
        }
      });
    }
    
    fs.writeFileSync(outputPath, markdown);
    console.log(`📄 Human-readable report saved to: ${outputPath}`);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const appDir = args[0] || './apps/web/src/app';
  const outputPath = args[1] || './route-registry.json';
  
  console.log('🚀 Starting Route Registry Generation...\n');
  
  const registry = new RouteRegistry();
  registry.scanAppDirectory(appDir);
  
  const report = registry.generateReport();
  
  console.log('\n📊 Route Registry Summary:');
  console.log(`  Routes: ${report.summary.totalRoutes}`);
  console.log(`  Links: ${report.summary.totalLinks}`);
  console.log(`  Buttons: ${report.summary.totalButtons}`);
  console.log(`  Dead Links: ${report.summary.deadLinks}`);
  console.log(`  Missing Routes: ${report.summary.missingRoutes}`);
  console.log(`  Errors: ${report.summary.errors}`);
  
  if (report.summary.deadLinks > 0) {
    console.log('\n🚨 Dead Links Found:');
    report.issues.deadLinks.forEach(link => {
      console.log(`  - ${link}`);
    });
  }
  
  if (report.summary.missingRoutes > 0) {
    console.log('\n⚠️ Missing Routes:');
    report.issues.missingRoutes.forEach(route => {
      console.log(`  - ${route}`);
    });
  }
  
  registry.saveReport(outputPath);
  
  // Exit with error code if issues found
  if (report.summary.deadLinks > 0 || report.summary.errors > 0) {
    console.log('\n❌ Route registry generation completed with errors');
    process.exit(1);
  } else {
    console.log('\n✅ Route registry generation completed successfully');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = RouteRegistry;
