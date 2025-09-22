import { Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { UnauthorizedError, AuthenticatedUser, AuthRequest } from "@blueprint/shared"

export { AuthenticatedUser, AuthRequest }

// Cryptographically secure authentication middleware
export const authenticateToken = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    let token = req.cookies?.authToken

    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (!token) {
      throw new UnauthorizedError("Access token required")
    }

    const secret = process.env.JWT_SECRET || "default_secret"
    const decoded = jwt.verify(token, secret) as AuthenticatedUser

    req.user = decoded
    req.userId = decoded.userId
    req.token = token
    next()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error)
    }
    next(new UnauthorizedError("Invalid or expired authentication token"))
  }
}
