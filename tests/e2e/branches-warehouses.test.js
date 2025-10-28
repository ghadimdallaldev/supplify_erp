/**
 * E2E Tests for Branches and Warehouses with Plan Enforcement
 * 
 * Test Cases:
 * 1. Bronze restaurant tries to add second branch → blocked
 * 2. Gold restaurant creates 3 branches → allowed; 4th blocked
 * 3. Free supplier cannot add warehouses; inventory defaults to "Unassigned"
 * 4. Bronze supplier adds 1 warehouse; 2nd attempt blocked
 * 5. Orders require branch_id on multi-branch tenants
 * 6. Receiving requires branch_id on multi-branch
 * 7. Pick/pack requires warehouse_id when warehouses enabled
 * 8. Analytics tabs appear only when >1 enabled by plan
 * 9. Plan downgrade with excess branches/warehouses
 * 10. Usage counters update on create/delete
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';

// Test data
let restaurantToken;
let supplierToken;
let adminToken;
let restaurantId;
let supplierId;
let branchIds = [];
let warehouseIds = [];

describe('Branches and Warehouses E2E Tests', () => {
  
  beforeAll(async () => {
    // Login as restaurant, supplier, and admin
    // TODO: Implement authentication setup
  });

  afterAll(async () => {
    // Cleanup test data
    // TODO: Implement cleanup
  });

  describe('Branch Creation - Plan Enforcement', () => {
    
    it('TC1: Bronze restaurant should be blocked from creating second branch', async () => {
      // 1. Assume restaurant is on Bronze plan (branch limit = 1)
      // 2. Create first branch (should succeed)
      const firstBranch = await axios.post(
        `${API_BASE_URL}/api/branches`,
        {
          name: 'Test Branch 1',
          code: 'BR1',
          address: { street: '123 Main St', city: 'Test City' }
        },
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(firstBranch.status).toBe(201);
      branchIds.push(firstBranch.data.data.branch.id);

      // 3. Try to create second branch (should fail with BRANCH_LIMIT_REACHED)
      try {
        const secondBranch = await axios.post(
          `${API_BASE_URL}/api/branches`,
          {
            name: 'Test Branch 2',
            code: 'BR2'
          },
          { headers: { Authorization: `Bearer ${restaurantToken}` } }
        );
        
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error.name).toBe('BRANCH_LIMIT_REACHED');
        expect(error.response.data.error.details.currentPlan).toBe('Bronze');
        expect(error.response.data.error.details.requiredPlan).toBeDefined();
      }
    });

    it('TC2: Gold restaurant can create 3 branches, 4th is blocked', async () => {
      // This test requires upgrading restaurant to Gold plan first
      // TODO: Implement plan upgrade in test setup
      
      // Create 3 branches (all should succeed)
      for (let i = 1; i <= 3; i++) {
        const branch = await axios.post(
          `${API_BASE_URL}/api/branches`,
          {
            name: `Gold Branch ${i}`,
            code: `GB${i}`
          },
          { headers: { Authorization: `Bearer ${restaurantToken}` } }
        );
        
        expect(branch.status).toBe(201);
        branchIds.push(branch.data.data.branch.id);
      }

      // 4th branch should be blocked
      try {
        const fourthBranch = await axios.post(
          `${API_BASE_URL}/api/branches`,
          { name: 'Gold Branch 4', code: 'GB4' },
          { headers: { Authorization: `Bearer ${restaurantToken}` } }
        );
        
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error.name).toBe('BRANCH_LIMIT_REACHED');
      }
    });
  });

  describe('Warehouse Creation - Plan Enforcement', () => {
    
    it('TC3: Free supplier cannot add warehouses', async () => {
      // Free plan has warehouses limit = 0
      try {
        const warehouse = await axios.post(
          `${API_BASE_URL}/api/warehouses`,
          {
            name: 'Test Warehouse',
            code: 'WH1'
          },
          { headers: { Authorization: `Bearer ${supplierToken}` } }
        );
        
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error.name).toBe('WAREHOUSE_LIMIT_REACHED');
        expect(error.response.data.error.details.currentPlan).toBe('Free');
      }
    });

    it('TC4: Bronze supplier can create 1 warehouse, 2nd is blocked', async () => {
      // Upgrade supplier to Bronze plan (warehouses limit = 1)
      
      // Create first warehouse
      const firstWarehouse = await axios.post(
        `${API_BASE_URL}/api/warehouses`,
        {
          name: 'Bronze Warehouse',
          code: 'BW1'
        },
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      expect(firstWarehouse.status).toBe(201);
      warehouseIds.push(firstWarehouse.data.data.warehouse.id);

      // Try to create second warehouse (should fail)
      try {
        const secondWarehouse = await axios.post(
          `${API_BASE_URL}/api/warehouses`,
          { name: 'Bronze Warehouse 2', code: 'BW2' },
          { headers: { Authorization: `Bearer ${supplierToken}` } }
        );
        
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error.name).toBe('WAREHOUSE_LIMIT_REACHED');
      }
    });
  });

  describe('Order Validation - Branch ID Required', () => {
    
    it('TC5: Orders require branch_id on multi-branch restaurant', async () => {
      // Restaurant with Gold plan (multiple branches)
      
      // Create order WITHOUT branch_id (should fail)
      try {
        const order = await axios.post(
          `${API_BASE_URL}/api/orders`,
          {
            supplier_id: supplierId,
            items: [{ product_id: 'test', quantity: 10 }],
            // No branch_id provided
          },
          { headers: { Authorization: `Bearer ${restaurantToken}` } }
        );
        
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error.message).toContain('branch_id');
      }

      // Create order WITH branch_id (should succeed)
      const orderWithBranch = await axios.post(
        `${API_BASE_URL}/api/orders`,
        {
          supplier_id: supplierId,
          branch_id: branchIds[0],
          items: [{ product_id: 'test', quantity: 10 }]
        },
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(orderWithBranch.status).toBe(201);
    });
  });

  describe('Receiving Validation - Branch ID Required', () => {
    
    it('TC6: Receiving requires branch_id on multi-branch', async () => {
      // TODO: Implement receiving endpoint test
      // This should validate branch_id is required when restaurant has multiple branches
    });
  });

  describe('Pick/Pack Validation - Warehouse ID Required', () => {
    
    it('TC7: Pick/pack requires warehouse_id when warehouses enabled', async () => {
      // TODO: Implement pick/pack endpoint test
      // This should validate warehouse_id is required when supplier has warehouses
    });
  });

  describe('Analytics Visibility - Plan-Based', () => {
    
    it('TC8: Analytics tabs appear only when >1 enabled by plan', async () => {
      // TODO: Test that "By Branch" and "By Warehouse" tabs in analytics
      // only appear when the restaurant/supplier has multiple locations
      // based on their plan capabilities
    });
  });

  describe('Plan Downgrade - Excess Branches/Warehouses', () => {
    
    it('TC9: Plan downgrade locks creation but keeps existing', async () => {
      // Restaurant with 3 branches on Gold plan
      // Downgrade to Bronze (branch limit = 1)
      
      // 1. Verify can still access all 3 branches (read-only not enforced in this test)
      const branches = await axios.get(
        `${API_BASE_URL}/api/branches`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(branches.data.data.branches.length).toBeGreaterThan(1);

      // 2. Verify cannot create new branches
      try {
        const newBranch = await axios.post(
          `${API_BASE_URL}/api/branches`,
          { name: 'Excess Branch', code: 'EXC1' },
          { headers: { Authorization: `Bearer ${restaurantToken}` } }
        );
        
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error.name).toBe('BRANCH_LIMIT_REACHED');
      }
    });
  });

  describe('Usage Counter Updates', () => {
    
    it('TC10: Usage counters update on create/delete', async () => {
      // Get initial usage
      const initialUsage = await axios.get(
        `${API_BASE_URL}/api/subscriptions/usage`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      const initialBranchCount = initialUsage.data.data.branches_count || 0;

      // Create a branch
      const branch = await axios.post(
        `${API_BASE_URL}/api/branches`,
        { name: 'Usage Test Branch', code: 'UTB1' },
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      const newBranchId = branch.data.data.branch.id;

      // Check usage incremented
      const updatedUsage = await axios.get(
        `${API_BASE_URL}/api/subscriptions/usage`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(updatedUsage.data.data.branches_count).toBe(initialBranchCount + 1);

      // Delete the branch
      await axios.delete(
        `${API_BASE_URL}/api/branches/${newBranchId}`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );

      // Check usage decremented
      const finalUsage = await axios.get(
        `${API_BASE_URL}/api/subscriptions/usage`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(finalUsage.data.data.branches_count).toBe(initialBranchCount);
    });
  });
});

