/**
 * E2E Tests for Admin Dashboard - All Features
 */

import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';

describe('Admin Dashboard E2E Tests', () => {
  let adminToken;

  beforeAll(async () => {
    const login = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'admin@test.com',
      password: 'password123'
    });
    adminToken = login.data.data.token;
  });

  describe('Overview Tab', () => {
    
    it('Should get platform overview', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/overview`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.tenantCounts).toBeDefined();
      expect(response.data.data.subscriptionStats).toBeDefined();
    });
  });

  describe('Plans Management', () => {
    
    it('Should list all plans', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/plans`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.plans.length).toBeGreaterThan(0);
    });

    it('Should update plan limits', async () => {
      const plans = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/plans`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      const bronzePlan = plans.data.data.plans.find(p => p.code === 'bronze');
      
      const updated = await axios.patch(
        `${API_BASE_URL}/api/admin-dashboard/plans/${bronzePlan.id}`,
        {
          limits: { ...bronzePlan.limits, branches: 2 }
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(updated.status).toBe(200);
      
      // Verify audit log created
      const audit = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/audit-logs?action_type=UPDATE_PLAN`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      const relevantLog = audit.data.data.logs.find(
        log => log.target_entity_id === bronzePlan.id
      );
      expect(relevantLog).toBeDefined();
    });

    it('Should update plan pricing', async () => {
      // TODO: Implement
    });
  });

  describe('Subscriptions Management', () => {
    
    it('Should list all subscriptions', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/subscriptions`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.subscriptions).toBeInstanceOf(Array);
    });

    it('Should change tenant plan (upgrade)', async () => {
      const subscriptions = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/subscriptions`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      if (subscriptions.data.data.subscriptions.length > 0) {
        const sub = subscriptions.data.data.subscriptions[0];
        const goldPlan = await axios.get(
          `${API_BASE_URL}/api/admin-dashboard/plans`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        ).then(r => r.data.data.plans.find(p => p.code === 'gold'));
        
        const updated = await axios.patch(
          `${API_BASE_URL}/api/admin-dashboard/subscriptions/${sub.id}`,
          { plan_id: goldPlan.id },
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        
        expect(updated.status).toBe(200);
      }
    });

    it('Should show impact preview before downgrade', async () => {
      // TODO: Implement impact preview test
    });
  });

  describe('Plan Features', () => {
    
    it('Should check features from subscription plan', async () => {
      // Features are now controlled solely by subscription plan features JSONB
      // To test, verify isFeatureEnabled() checks plan.features correctly
      // TODO: Implement plan feature tests
    });
  });

  describe('Usage & Quotas', () => {
    
    it('Should get platform usage overview', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/usage`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
    });

    it('Should get tenant usage details', async () => {
      // Get tenant
      const tenants = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/tenants/restaurants`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      if (tenants.data.data.restaurants.length > 0) {
        const tenantId = tenants.data.data.restaurants[0].id;
        const usage = await axios.get(
          `${API_BASE_URL}/api/admin-dashboard/tenants/restaurants/${tenantId}/usage`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        
        expect(usage.status).toBe(200);
      }
    });
  });

  describe('Audit Logs', () => {
    
    it('Should list audit logs', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/audit-logs`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.logs).toBeInstanceOf(Array);
    });

    it('Should filter audit logs by action type', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/audit-logs?action_type=UPDATE_PLAN`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
    });

    it('Should search audit logs', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin-dashboard/audit-logs?search=bronze`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
    });
  });
});

