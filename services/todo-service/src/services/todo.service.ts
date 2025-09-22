import { Todo, TodoDocument } from "../models/todo.model"
import { CreateTodoDTO, UpdateTodoDTO } from "../types/todo.types"
import { publishToQueue } from "../config/rabbitmq"
import { NotFoundError, QUEUES, TodoCreatedEvent } from "@blueprint/shared"

export interface TodoFilterOptions {
  completed?: boolean
  priority?: "low" | "medium" | "high"
  page?: number
  limit?: number
}

// Create a new todo and publish Event-Carried State Transfer payload
export const createTodo = async (
  userId: string,
  userName: string,
  userEmail: string,
  todoData: CreateTodoDTO,
  correlationId?: string
): Promise<TodoDocument> => {
  const todo = new Todo({
    title: todoData.title,
    description: todoData.description || "",
    dueDate: todoData.dueDate,
    priority: todoData.priority || "medium",
    userId,
  })

  await todo.save()

  const eventPayload: TodoCreatedEvent = {
    todoId: todo._id.toString(),
    userId: todo.userId,
    userName: userName || "User",
    userEmail: userEmail || "user@example.com",
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    dueDate: todo.dueDate ? todo.dueDate.toISOString() : undefined,
    createdAt: todo.createdAt.toISOString(),
    correlationId,
  }

  try {
    await publishToQueue(QUEUES.TODO_CREATED, eventPayload, correlationId)
  } catch (error) {
    // Non-blocking event publish log or retry
    console.error("Failed to publish todo_created event to RabbitMQ:", error)
  }

  return todo
}

// Get paginated list of todos for the authenticated user
export const getTodos = async (
  userId: string,
  options: TodoFilterOptions = {}
): Promise<{ todos: TodoDocument[]; total: number; page: number; totalPages: number }> => {
  const page = Math.max(1, options.page || 1)
  const limit = Math.min(100, Math.max(1, options.limit || 10))
  const skip = (page - 1) * limit

  const query: Record<string, any> = { userId }

  if (typeof options.completed === "boolean") {
    query.completed = options.completed
  }
  if (options.priority) {
    query.priority = options.priority
  }

  const [todos, total] = await Promise.all([
    Todo.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Todo.countDocuments(query),
  ])

  return {
    todos,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  }
}

// Get single todo by ID with user ownership check
export const getTodoById = async (
  userId: string,
  todoId: string
): Promise<TodoDocument> => {
  const todo = await Todo.findOne({ _id: todoId, userId })
  if (!todo) {
    throw new NotFoundError("Todo not found or unauthorized access")
  }
  return todo
}

// Update existing todo with user ownership check
export const updateTodo = async (
  userId: string,
  todoId: string,
  updateData: UpdateTodoDTO
): Promise<TodoDocument> => {
  const todo = await Todo.findOneAndUpdate(
    { _id: todoId, userId },
    { $set: updateData },
    { new: true, runValidators: true }
  )

  if (!todo) {
    throw new NotFoundError("Todo not found or unauthorized access")
  }

  return todo
}

// Delete todo with user ownership check
export const deleteTodo = async (
  userId: string,
  todoId: string
): Promise<TodoDocument> => {
  const todo = await Todo.findOneAndDelete({ _id: todoId, userId })
  if (!todo) {
    throw new NotFoundError("Todo not found or unauthorized access")
  }
  return todo
}
