import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { api } from './api';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET requests', () => {
    it('should make GET request', async () => {
      const mockData = { ok: true, data: { id: '1' } };
      mockedAxios.get.mockResolvedValue({ data: mockData });

      const result = await api.get('/test');

      expect(mockedAxios.get).toHaveBeenCalledWith('/test', undefined);
      expect(result.data).toEqual(mockData);
    });

    it('should handle GET request errors', async () => {
      const error = new Error('Request failed');
      mockedAxios.get.mockRejectedValue(error);

      await expect(api.get('/test')).rejects.toThrow();
    });
  });

  describe('POST requests', () => {
    it('should make POST request', async () => {
      const mockData = { ok: true, data: { id: '1' } };
      mockedAxios.post.mockResolvedValue({ data: mockData });

      const result = await api.post('/test', { name: 'Test' });

      expect(mockedAxios.post).toHaveBeenCalledWith('/test', { name: 'Test' }, undefined);
      expect(result.data).toEqual(mockData);
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request', async () => {
      const mockData = { ok: true, data: { id: '1' } };
      mockedAxios.put.mockResolvedValue({ data: mockData });

      const result = await api.put('/test/1', { name: 'Updated' });

      expect(mockedAxios.put).toHaveBeenCalledWith('/test/1', { name: 'Updated' }, undefined);
      expect(result.data).toEqual(mockData);
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      const mockData = { ok: true, data: null };
      mockedAxios.delete.mockResolvedValue({ data: mockData });

      const result = await api.delete('/test/1');

      expect(mockedAxios.delete).toHaveBeenCalledWith('/test/1', undefined);
      expect(result.data).toEqual(mockData);
    });
  });
});
