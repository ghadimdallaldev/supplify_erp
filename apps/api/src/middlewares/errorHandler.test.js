import { describe, it, expect, vi, beforeEach } from 'vitest';
import { errorHandler, ValidationError, NotFoundError, ForbiddenError } from './errorHandler.js';

vi.mock('../lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      requestId: 'test-request-id',
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  describe('ValidationError', () => {
    it('should handle validation errors with 400 status', () => {
      const error = new ValidationError('Invalid input');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            name: 'VALIDATION_ERROR',
            message: 'Invalid input',
          }),
          requestId: 'test-request-id',
        })
      );
    });
  });

  describe('NotFoundError', () => {
    it('should handle not found errors with 404 status', () => {
      const error = new NotFoundError('Resource not found');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            name: 'NOT_FOUND',
            message: 'Resource not found',
          }),
          requestId: 'test-request-id',
        })
      );
    });
  });

  describe('ForbiddenError', () => {
    it('should handle forbidden errors with 403 status', () => {
      const error = new ForbiddenError('Access denied');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            name: 'FORBIDDEN',
            message: 'Forbidden',
          }),
          requestId: 'test-request-id',
        })
      );
    });
  });

  describe('Generic Error', () => {
    it('should handle generic errors with 500 status', () => {
      const error = new Error('Internal server error');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            name: 'INTERNAL_ERROR',
            message: 'Internal server error',
          }),
          requestId: 'test-request-id',
        })
      );
    });

    it('should include requestId in error response', () => {
      const error = new Error('Test error');

      errorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id',
        })
      );
    });
  });
});
