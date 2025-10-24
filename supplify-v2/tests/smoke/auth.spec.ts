import { describe, it, expect } from '@jest/globals';

describe('Authentication', () => {
  it('should reject requests without authorization header', async () => {
    const response = await fetch('http://localhost:4000/auth/me');
    
    expect(response.status).toBe(401);
  });

  it('should reject requests with invalid token', async () => {
    const response = await fetch('http://localhost:4000/auth/me', {
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
    });
    
    expect(response.status).toBe(401);
  });
});
