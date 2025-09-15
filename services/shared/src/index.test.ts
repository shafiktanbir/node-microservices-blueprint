import express from 'express';
import { z } from 'zod';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from './errors';
import { correlationIdMiddleware, CORRELATION_ID_HEADER } from './middleware/correlationId';
import { createErrorHandler } from './middleware/errorHandler';
import { createLogger } from './logger';
import { TodoCreatedEventSchema, QUEUES, EXCHANGES } from './events';
import { RabbitMQClient } from './rabbitmq';

describe('Shared Module Tests', () => {
  describe('AppError Hierarchy', () => {
    it('should create an AppError with correct defaults', () => {
      const error = new AppError('Something went wrong', 500);
      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.status).toBe('error');
      expect(error.isOperational).toBe(true);
    });

    it('should create specific AppError subclasses with correct status codes', () => {
      expect(new BadRequestError('bad').statusCode).toBe(400);
      expect(new BadRequestError('bad').status).toBe('fail');

      expect(new UnauthorizedError('unauth').statusCode).toBe(401);
      expect(new ForbiddenError('forbid').statusCode).toBe(403);
      expect(new NotFoundError('notfound').statusCode).toBe(404);
      expect(new ConflictError('conflict').statusCode).toBe(409);
      expect(new ValidationError('invalid', { field: 'name' }).statusCode).toBe(422);
      expect(new InternalServerError('server').statusCode).toBe(500);
    });
  });

  describe('Correlation ID Middleware', () => {
    it('should extract existing x-correlation-id header', () => {
      const req: any = { headers: { [CORRELATION_ID_HEADER]: 'custom-req-id-123' } };
      const res: any = { setHeader: jest.fn() };
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBe('custom-req-id-123');
      expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'custom-req-id-123');
      expect(next).toHaveBeenCalled();
    });

    it('should generate a new UUID when x-correlation-id is missing', () => {
      const req: any = { headers: {} };
      const res: any = { setHeader: jest.fn() };
      const next = jest.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(typeof req.correlationId).toBe('string');
      expect(req.correlationId.length).toBeGreaterThan(10);
      expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, req.correlationId);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Global Error Handler Middleware', () => {
    it('should handle AppError properly', () => {
      const errorHandler = createErrorHandler();
      const err = new NotFoundError('User not found');
      const req: any = { correlationId: 'corr-1', path: '/api/users/1' };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'User not found',
          statusCode: 404,
          details: undefined,
        },
        correlationId: 'corr-1',
      });
    });

    it('should format ZodError issues into a 400 response', () => {
      const schema = z.object({ email: z.string().email() });
      const parseResult = schema.safeParse({ email: 'not-an-email' });
      expect(parseResult.success).toBe(false);

      if (!parseResult.success) {
        const errorHandler = createErrorHandler();
        const req: any = { correlationId: 'corr-2', path: '/api/users' };
        const res: any = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        const next = jest.fn();

        errorHandler(parseResult.error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: 'Validation failed',
              statusCode: 400,
            }),
            correlationId: 'corr-2',
          })
        );
      }
    });

    it('should handle Mongoose CastError', () => {
      const errorHandler = createErrorHandler();
      const castErr = { name: 'CastError', kind: 'ObjectId', path: 'userId' };
      const req: any = { correlationId: 'corr-3' };
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorHandler(castErr, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Invalid ID format for parameter: userId',
            statusCode: 400,
          }),
        })
      );
    });

    it('should handle JWT error with 401', () => {
      const errorHandler = createErrorHandler();
      const jwtErr = { name: 'JsonWebTokenError', message: 'invalid signature' };
      const req: any = {};
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorHandler(jwtErr, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ statusCode: 401 }),
        })
      );
    });
  });

  describe('TodoCreatedEventSchema', () => {
    it('should validate valid event payload', () => {
      const validPayload = {
        todoId: '64f1234567890abcdef12345',
        userId: '64f0987654321fedcba54321',
        userName: 'Shafik Tanbir',
        userEmail: 'shafik@example.com',
        title: 'Design Microservices',
        description: 'Complete Day 4 roadmap',
        priority: 'high',
        dueDate: new Date().toISOString(),
      };

      const result = TodoCreatedEventSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject payload with invalid email or missing title', () => {
      const invalidPayload = {
        todoId: '123',
        userId: '456',
        userName: 'Shafik',
        userEmail: 'invalid-email',
        title: '',
      };

      const result = TodoCreatedEventSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should provide queue constants', () => {
      expect(QUEUES.TODO_CREATED).toBe('todo_created');
      expect(QUEUES.TODO_CREATED_DLQ).toBe('todo_created.dlq');
      expect(EXCHANGES.DLX_TODO).toBe('dlx.todo');
    });
  });

  describe('Logger Factory', () => {
    it('should create a logger with serviceName', () => {
      const logger = createLogger('TestService');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('RabbitMQClient Class', () => {
    it('should instantiate with default and custom options', () => {
      const client = new RabbitMQClient({
        serviceName: 'TestService',
        url: 'amqp://localhost:5672',
      });
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
      expect(client.getChannel()).toBeNull();
      expect(client.getConnection()).toBeNull();
    });
  });
});
