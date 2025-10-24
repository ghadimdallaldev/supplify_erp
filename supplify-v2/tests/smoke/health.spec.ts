import { describe, it, expect } from '@jest/globals';

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const response = await fetch('http://localhost:4000/health');
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('healthy');
  });
});
