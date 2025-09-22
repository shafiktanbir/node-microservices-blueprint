import { Router, Response, NextFunction } from "express"
import { z } from "zod"
import { AuthRequest, authenticateToken } from "../middleware/auth.middleware"
import {
  createTodo,
  getTodos,
  getTodoById,
  updateTodo,
  deleteTodo,
} from "../services/todo.service"

const router = Router()

// All todo endpoints require authentication
router.use(authenticateToken)

export const createTodoSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional().default(""),
  dueDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
})

export const updateTodoSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
  dueDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  priority: z.enum(["low", "medium", "high"]).optional(),
})

// Create new todo
router.post("/", async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createTodoSchema.parse(req.body)
    const userId = req.user!.userId
    const userName = req.user!.name || "User"
    const userEmail = req.user!.email || "user@example.com"
    const correlationId = req.correlationId

    const todo = await createTodo(userId, userName, userEmail, validatedData, correlationId)
    res.status(201).json({ success: true, data: todo })
  } catch (error) {
    next(error)
  }
})

// Get all todos for user with optional filtering & pagination
router.get("/", async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId
    const completedQuery = req.query.completed
    const priorityQuery = req.query.priority as "low" | "medium" | "high" | undefined
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10

    let completed: boolean | undefined = undefined
    if (completedQuery === "true") completed = true
    if (completedQuery === "false") completed = false

    const result = await getTodos(userId, { completed, priority: priorityQuery, page, limit })
    res.status(200).json({ success: true, ...result })
  } catch (error) {
    next(error)
  }
})

// Get single todo by ID
router.get("/:id", async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId
    const todo = await getTodoById(userId, req.params.id)
    res.status(200).json({ success: true, data: todo })
  } catch (error) {
    next(error)
  }
})

// Update existing todo
router.patch("/:id", async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updateTodoSchema.parse(req.body)
    const userId = req.user!.userId
    const updatedTodo = await updateTodo(userId, req.params.id, validatedData)
    res.status(200).json({ success: true, data: updatedTodo })
  } catch (error) {
    next(error)
  }
})

// Delete todo
router.delete("/:id", async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId
    const deletedTodo = await deleteTodo(userId, req.params.id)
    res.status(200).json({ success: true, message: "Todo deleted successfully", data: deletedTodo })
  } catch (error) {
    next(error)
  }
})

export default router
