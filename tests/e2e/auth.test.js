/**
 * E2E Tests for Authentication System
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';

describe('Authentication E2E Tests', () => {
  
  // Skip actual API calls for now - need running server
  it.skip('Should login restaurant user', async () => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'restaurant@test.com',
      password: 'password123'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.data.token).toBeDefined();
    expect(response.data.data.user.role).toBe('RESTAURANT');
  });

  it('Should login supplier user', async () => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'supplier@test.com',
      password: 'password123'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.data.token).toBeDefined();
    expect(response.data.data.user.role).toBe('SUPPLIER');
  });

  it('Should login admin user', async () => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'admin@test.com',
      password: 'password123'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.data.token).toBeDefined();
    expect(response.data.data.user.role).toBe('ADMIN');
  });

  it('Should reject invalid credentials', async () => {
    try {
      await axios.post(`${API_BASE_URL}/auth/login`, {
        email: 'invalid@test.com',
        password: 'wrong'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(401);
    }
  });

  it('Should require auth for protected routes', async () => {
    try {
      await axios.get(`${API_BASE_URL}/api/products`);
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(401);
    }
  });

  it('Should refresh token successfully', async () => {
    // TODO: Implement token refresh test
  });

  it('Should logout successfully', async () => {
    // TODO: Implement logout test
  });
});

