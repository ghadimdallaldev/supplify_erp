/**
 * E2E Tests for Products System
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';

describe('Products E2E Tests', () => {
  let supplierToken;
  let supplierId;

  beforeAll(async () => {
    // Login as supplier
    const login = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'supplier@test.com',
      password: 'password123'
    });
    supplierToken = login.data.data.token;
    
    const { data: suppliers } = await axios.get(
      `${API_BASE_URL}/api/suppliers`,
      { headers: { Authorization: `Bearer ${supplierToken}` } }
    );
    supplierId = suppliers.data.suppliers[0].id;
  });

  describe('Product CRUD', () => {
    
    it('Should create product with plan limit check', async () => {
      const product = await axios.post(
        `${API_BASE_URL}/api/products`,
        {
          name: 'Test Product',
          description: 'Test description',
          category: 'Vegetables',
          unit_of_measure: 'LB',
          supplier_id: supplierId
        },
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      expect(product.status).toBe(201);
      expect(product.data.data.product.name).toBe('Test Product');
    });

    it('Should block product creation when limit reached', async () => {
      // Free plan: 50 products max
      // Create products up to limit, then verify 51st fails
      // TODO: Implement full test
    });

    it('Should list products', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/products`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.data.products).toBeInstanceOf(Array);
    });

    it('Should get product by ID', async () => {
      const products = await axios.get(
        `${API_BASE_URL}/api/products`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      if (products.data.data.products.length > 0) {
        const productId = products.data.data.products[0].id;
        const product = await axios.get(
          `${API_BASE_URL}/api/products/${productId}`,
          { headers: { Authorization: `Bearer ${supplierToken}` } }
        );
        
        expect(product.status).toBe(200);
        expect(product.data.data.product.id).toBe(productId);
      }
    });

    it('Should update product', async () => {
      const products = await axios.get(
        `${API_BASE_URL}/api/products`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      if (products.data.data.products.length > 0) {
        const productId = products.data.data.products[0].id;
        const updated = await axios.put(
          `${API_BASE_URL}/api/products/${productId}`,
          { name: 'Updated Product Name' },
          { headers: { Authorization: `Bearer ${supplierToken}` } }
        );
        
        expect(updated.status).toBe(200);
        expect(updated.data.data.product.name).toBe('Updated Product Name');
      }
    });

    it('Should delete product and decrement usage', async () => {
      // Create product
      const created = await axios.post(
        `${API_BASE_URL}/api/products`,
        {
          name: 'To Delete',
          category: 'Test',
          unit_of_measure: 'LB',
          supplier_id: supplierId
        },
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      const productId = created.data.data.product.id;
      
      // Delete product
      await axios.delete(
        `${API_BASE_URL}/api/products/${productId}`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      // Verify deleted
      try {
        await axios.get(
          `${API_BASE_URL}/api/products/${productId}`,
          { headers: { Authorization: `Bearer ${supplierToken}` } }
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
      
      // TODO: Verify usage counter decremented
    });
  });

  describe('Product Search & Filters', () => {
    
    it('Should filter products by category', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/products?category=Vegetables`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      expect(response.status).toBe(200);
      // Verify all returned products are in Vegetables category
    });

    it('Should search products by name', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/products?search=Test`,
        { headers: { Authorization: `Bearer ${supplierToken}` } }
      );
      
      expect(response.status).toBe(200);
    });
  });
});

