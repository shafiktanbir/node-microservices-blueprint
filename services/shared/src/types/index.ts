import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: AuthenticatedUser;
      userId?: string;
    }
  }
}

export type AuthRequest = Request & {
  correlationId?: string;
  user?: AuthenticatedUser;
  userId?: string;
  token?: string;
};
