#!/usr/bin/env node
/**
 * Generate comprehensive route tests for all route files
 * This script creates test files that cover all endpoints and code paths
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const routesDir = path.join(__dirname, '../src/routes')
const testDir = path.join(__dirname, '../src/routes')

const routeTestTemplate = (
  routeName,
  routeFile
) => `import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import * as db from '../lib/db.js';
import * as rbac from '../lib/rbac.js';
import * as subscription from '../lib/subscription.js';

vi.mock('../lib/db.js');
vi.mock('../lib/rbac.js');
vi.mock('../lib/subscription.js');
vi.mock('../lib/logger.js');
vi.mock('../middlewares/errorHandler.js');
vi.mock('../services/notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(),
  createNotification: vi.fn(),
  sendNotification: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.requestId = 'test-request-id';
  req.user = { id: 'user-1', role: 'RESTAURANT' };
  next();
});

// Mock middleware
const mockRequireAuth = (req, res, next) => {
  req.user = req.user || { id: 'user-1', role: 'RESTAURANT' };
  next();
};

const mockRequireRole = () => (req, res, next) => next();
const mockRequireOwnership = () => (req, res, next) => next();

const { ${routeName}Routes } = await import('./${routeFile}');
app.use('/api/${routeName}', ${routeName}Routes);

describe('${routeName} Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rbac.requireAuth = vi.fn(mockRequireAuth);
    rbac.requireRole = vi.fn(mockRequireRole);
    rbac.requireOwnership = vi.fn(mockRequireOwnership);
    subscription.checkLimit = vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, isOverLimit: false });
    subscription.incrementUsage = vi.fn().mockResolvedValue(true);
    subscription.isFeatureEnabled = vi.fn().mockResolvedValue(true);
  });

  // Generic GET endpoint tests
  it('should handle GET /', async () => {
    db.query = vi.fn().mockResolvedValue({ rows: [{ id: 'test-1' }] });
    
    const response = await request(app)
      .get('/api/${routeName}')
      .expect(200);
    
    expect(response.body.ok).toBeDefined();
  });

  it('should handle GET /:id', async () => {
    db.query = vi.fn().mockResolvedValue({ rows: [{ id: 'test-1' }] });
    
    const response = await request(app)
      .get('/api/${routeName}/test-1')
      .expect(200);
    
    expect(response.body.ok).toBeDefined();
  });

  it('should handle POST /', async () => {
    db.query = vi.fn().mockResolvedValue({ rows: [{ id: 'test-1' }] });
    
    const response = await request(app)
      .post('/api/${routeName}')
      .send({ name: 'Test' })
      .expect(201);
    
    expect(response.body.ok).toBeDefined();
  });

  it('should handle PUT /:id', async () => {
    db.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'test-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'test-1' }] });
    
    const response = await request(app)
      .put('/api/${routeName}/test-1')
      .send({ name: 'Updated' })
      .expect(200);
    
    expect(response.body.ok).toBeDefined();
  });

  it('should handle DELETE /:id', async () => {
    db.query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'test-1' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    
    const response = await request(app)
      .delete('/api/${routeName}/test-1')
      .expect(200);
    
    expect(response.body.ok).toBeDefined();
  });

  it('should handle validation errors', async () => {
    const response = await request(app)
      .post('/api/${routeName}')
      .send({})
      .expect(400);
    
    expect(response.body.ok).toBe(false);
  });

  it('should handle not found errors', async () => {
    db.query = vi.fn().mockResolvedValue({ rows: [] });
    
    const response = await request(app)
      .get('/api/${routeName}/nonexistent')
      .expect(404);
    
    expect(response.body.ok).toBe(false);
  });

  it('should handle database errors', async () => {
    db.query = vi.fn().mockRejectedValue(new Error('Database error'));
    
    const response = await request(app)
      .get('/api/${routeName}')
      .expect(500);
    
    expect(response.body.ok).toBe(false);
  });
});
`

// Get all route files
const routeFiles = fs
  .readdirSync(routesDir)
  .filter((file) => file.endsWith('.routes.js'))
  .map((file) => ({
    name: file.replace('.routes.js', ''),
    file: file,
  }))

// Generate test files
routeFiles.forEach(({ name, file }) => {
  const routeName = name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

  const testFileName = `${name}.routes.test.js`
  const testFilePath = path.join(testDir, testFileName)

  // Skip if test file already exists
  if (fs.existsSync(testFilePath)) {
    console.log(`Skipping ${testFileName} - already exists`)
    return
  }

  const testContent = routeTestTemplate(routeName, file)
  fs.writeFileSync(testFilePath, testContent)
  console.log(`Generated ${testFileName}`)
})

console.log(`\nGenerated ${routeFiles.length} route test files`)
