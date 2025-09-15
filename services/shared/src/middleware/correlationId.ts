import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incomingHeader = req.headers[CORRELATION_ID_HEADER];
  const correlationId = (
    typeof incomingHeader === 'string'
      ? incomingHeader
      : Array.isArray(incomingHeader)
      ? incomingHeader[0]
      : uuidv4()
  ).trim();

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
};
