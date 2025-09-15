import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { Logger } from '../logger';

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    statusCode: number;
    details?: unknown;
  };
  correlationId?: string;
  stack?: string;
}

export const createErrorHandler = (logger?: Logger): ErrorRequestHandler => {
  return (
    err: unknown,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction
  ): void => {
    const correlationId = req.correlationId;

    // 1. Handled AppError
    if (err instanceof AppError) {
      if (logger && err.statusCode >= 500) {
        logger.error({ err, correlationId, path: req.path }, err.message);
      } else if (logger) {
        logger.warn({ err: err.message, correlationId, path: req.path, statusCode: err.statusCode });
      }

      res.status(err.statusCode).json({
        success: false,
        error: {
          message: err.message,
          statusCode: err.statusCode,
          details: err.details,
        },
        correlationId,
      });
      return;
    }

    // 2. Zod Validation Error
    if (err instanceof ZodError) {
      const formattedErrors = err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      if (logger) {
        logger.warn({ issues: formattedErrors, correlationId, path: req.path }, 'Validation failure');
      }

      res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          statusCode: 400,
          details: formattedErrors,
        },
        correlationId,
      });
      return;
    }

    // 3. Mongoose CastError (e.g. invalid ObjectId)
    const errObj = err as any;
    if (errObj && (errObj.name === 'CastError' || errObj.kind === 'ObjectId')) {
      res.status(400).json({
        success: false,
        error: {
          message: `Invalid ID format for parameter: ${errObj.path || 'id'}`,
          statusCode: 400,
        },
        correlationId,
      });
      return;
    }

    // 4. Mongoose Duplicate Key Error (code 11000)
    if (errObj && errObj.code === 11000) {
      const duplicateField = errObj.keyValue ? Object.keys(errObj.keyValue).join(', ') : 'field';
      res.status(409).json({
        success: false,
        error: {
          message: `Duplicate value for ${duplicateField}`,
          statusCode: 409,
          details: errObj.keyValue,
        },
        correlationId,
      });
      return;
    }

    // 5. JWT Errors
    if (errObj && (errObj.name === 'JsonWebTokenError' || errObj.name === 'TokenExpiredError')) {
      res.status(401).json({
        success: false,
        error: {
          message: errObj.message === 'jwt expired' ? 'Token expired' : 'Invalid token signature',
          statusCode: 401,
        },
        correlationId,
      });
      return;
    }

    // 6. Unknown / Unhandled internal error
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const isProduction = process.env.NODE_ENV === 'production';

    if (logger) {
      logger.error({ err, correlationId, path: req.path, method: req.method }, 'Unhandled application error');
    }

    res.status(500).json({
      success: false,
      error: {
        message: isProduction ? 'Internal Server Error' : message,
        statusCode: 500,
      },
      correlationId,
      ...(!isProduction && err instanceof Error ? { stack: err.stack } : {}),
    });
  };
};

export const errorHandler = createErrorHandler();
export const errorHandlerMiddleware = createErrorHandler;
