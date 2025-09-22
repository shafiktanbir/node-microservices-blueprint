import { Router, Request, Response, NextFunction } from "express"
import { z } from "zod"
import { createUser, loginUser, getUserById } from "../services/user.service"
import { verifyToken } from "../utils/utils"
import { UnauthorizedError } from "@blueprint/shared"

const router = Router()

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
})

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

// Register a new user
router.post("/register", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = registerSchema.parse(req.body)
    const result = await createUser(validatedData)

    res.cookie("authToken", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

// Login user
router.post("/login", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = loginSchema.parse(req.body)
    const result = await loginUser(validatedData.email, validatedData.password)

    res.cookie("authToken", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

// Logout user
router.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie("authToken")
  res.status(200).json({ message: "Logged out successfully" })
})

// Get current authenticated user profile
router.get("/me", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = req.cookies?.authToken
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (!token) {
      throw new UnauthorizedError("Authentication required")
    }

    const payload = verifyToken(token)
    const user = await getUserById(payload.userId)
    res.status(200).json({ user })
  } catch (error) {
    next(error)
  }
})

// Internal lookup by User ID
router.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await getUserById(req.params.id)
    res.status(200).json({ user })
  } catch (error) {
    next(error)
  }
})

export default router
