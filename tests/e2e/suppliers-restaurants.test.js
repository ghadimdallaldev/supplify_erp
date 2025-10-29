/**
 * E2E Tests for Suppliers and Restaurants Management
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';

describe('Suppliers & Restaurants E2E Tests', () => {
  let adminToken;
  let supplierToken;
  let restaurantToken;

  beforeAll(async () => {
    // Setup tokens
    // TODO: Implement
  });

  describe('Suppliers', () => {
    
    it('Should list suppliers', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/suppliers`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.suppliers).toBeInstanceOf(Array);
    });

    it('Should get supplier details', async () => {
      const suppliers = await axios.get(
        `${API_BASE_URL}/api/suppliers`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      if (suppliers.data.data.suppliers.length > 0) {
        const supplierId = suppliers.data.data.suppliers[0].id;
        const supplier = await axios.get(
          `${API_BASE_URL}/api/suppliers/${supplierId}`,
          { headers: { Authorization: `Bearer ${supplierToken}` } }
        );
        
        expect(supplier.status).toBe(200);
      }
    });

    it('Should update supplier info', async () => {
      // TODO: Implement
    });

    it('Should search suppliers', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/suppliers?search=Test`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(response.status).toBe(200);
    });
  });

  describe('Restaurants', () => {
    
    it('Should list restaurants', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/restaurants`,
        { headers: { Authorization: `Bearer ${restaurantToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.restaurants).toBeInstanceOf(Array);
    });

    it('Should get restaurant details', async () => {
      // TODO: Implement
    });

    it('Should update restaurant info', async () => {
      // TODO: Implement
    });

    it('Should connect restaurant to suppliers', async () => {
      // TODO: Implement supplier connection flow
    });
  });
});

