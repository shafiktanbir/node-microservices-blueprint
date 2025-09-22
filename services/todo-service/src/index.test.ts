import request from "supertest"
import jwt from "jsonwebtoken"
import { app } from "./index"
import { Todo } from "./models/todo.model"
import { createTodoSchema, updateTodoSchema } from "./routes/todo.routes"
import * as rabbitConfig from "./config/rabbitmq"

describe("Todo Service Test Suite", () => {
  const JWT_SECRET = process.env.JWT_SECRET || "default_secret"
  const testUserId = "user-12345"
  const validToken = jwt.sign(
    { userId: testUserId, name: "Alice", email: "alice@example.com" },
    JWT_SECRET,
    { expiresIn: "1h" }
  )

  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(rabbitConfig, "publishToQueue").mockResolvedValue(undefined as any)
  })

  describe("Authentication & JWT Verification Middleware", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/todos")
      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe("Access token required")
    })

    it("rejects invalid/tampered JWT signatures with 401", async () => {
      const forgedToken = jwt.sign({ userId: "hacker" }, "wrong_secret")
      const res = await request(app)
        .get("/api/todos")
        .set("Authorization", `Bearer ${forgedToken}`)

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe("Invalid or expired authentication token")
    })

    it("accepts valid token via Authorization Bearer header", async () => {
      jest.spyOn(Todo, "find").mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      } as any)
      jest.spyOn(Todo, "countDocuments").mockResolvedValue(0)

      const res = await request(app)
        .get("/api/todos")
        .set("Authorization", `Bearer ${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("accepts valid token via authToken cookie", async () => {
      jest.spyOn(Todo, "find").mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      } as any)
      jest.spyOn(Todo, "countDocuments").mockResolvedValue(0)

      const res = await request(app)
        .get("/api/todos")
        .set("Cookie", [`authToken=${validToken}`])

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe("Zod Validation Schemas", () => {
    it("validates valid todo creation data", () => {
      const valid = { title: "Complete blueprint", description: "All 5 projects", priority: "high" }
      const parsed = createTodoSchema.parse(valid)
      expect(parsed.title).toBe("Complete blueprint")
      expect(parsed.priority).toBe("high")
    })

    it("rejects empty title", () => {
      expect(() => createTodoSchema.parse({ title: "   " })).toThrow()
    })

    it("validates partial update data", () => {
      const valid = { completed: true, priority: "low" }
      const parsed = updateTodoSchema.parse(valid)
      expect(parsed.completed).toBe(true)
      expect(parsed.priority).toBe("low")
    })
  })

  describe("HTTP CRUD Endpoints & Choreography", () => {
    it("GET /health returns 200 without authentication", async () => {
      const res = await request(app).get("/health")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "ok", service: "todo-service" })
    })

    it("POST /api/todos creates todo and publishes todo_created event", async () => {
      const mockSavedTodo = {
        _id: "todo-mongo-1",
        title: "Deploy cluster",
        description: "Hardened Helm",
        priority: "high",
        userId: testUserId,
        createdAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      }

      jest.spyOn(Todo.prototype, "save").mockImplementationOnce(async function (this: any) {
        this._id = mockSavedTodo._id
        this.createdAt = mockSavedTodo.createdAt
        return this
      })

      const res = await request(app)
        .post("/api/todos")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          title: "Deploy cluster",
          description: "Hardened Helm",
          priority: "high",
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.title).toBe("Deploy cluster")
      expect(rabbitConfig.publishToQueue).toHaveBeenCalledWith(
        "todo_created",
        expect.objectContaining({
          userId: testUserId,
          title: "Deploy cluster",
          userName: "Alice",
          userEmail: "alice@example.com",
        }),
        expect.any(String)
      )
    })

    it("GET /api/todos lists user todos with pagination and filters", async () => {
      const mockTodos = [
        { _id: "todo-1", title: "Task 1", userId: testUserId, completed: false },
        { _id: "todo-2", title: "Task 2", userId: testUserId, completed: false },
      ]

      jest.spyOn(Todo, "find").mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockTodos),
      } as any)
      jest.spyOn(Todo, "countDocuments").mockResolvedValue(2)

      const res = await request(app)
        .get("/api/todos?completed=false&page=1&limit=10")
        .set("Authorization", `Bearer ${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.todos.length).toBe(2)
      expect(res.body.total).toBe(2)
      expect(res.body.totalPages).toBe(1)
    })

    it("GET /api/todos/:id returns single todo if owned by user", async () => {
      jest.spyOn(Todo, "findOne").mockResolvedValueOnce({
        _id: "todo-1",
        title: "Task 1",
        userId: testUserId,
      } as any)

      const res = await request(app)
        .get("/api/todos/todo-1")
        .set("Authorization", `Bearer ${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe("Task 1")
    })

    it("GET /api/todos/:id returns 404 if todo belongs to another user", async () => {
      jest.spyOn(Todo, "findOne").mockResolvedValueOnce(null)

      const res = await request(app)
        .get("/api/todos/other-todo")
        .set("Authorization", `Bearer ${validToken}`)

      expect(res.status).toBe(404)
    })

    it("PATCH /api/todos/:id updates todo with ownership check", async () => {
      jest.spyOn(Todo, "findOneAndUpdate").mockResolvedValueOnce({
        _id: "todo-1",
        title: "Updated Task",
        completed: true,
        userId: testUserId,
      } as any)

      const res = await request(app)
        .patch("/api/todos/todo-1")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ completed: true, title: "Updated Task" })

      expect(res.status).toBe(200)
      expect(res.body.data.completed).toBe(true)
      expect(res.body.data.title).toBe("Updated Task")
    })

    it("DELETE /api/todos/:id deletes todo with ownership check", async () => {
      jest.spyOn(Todo, "findOneAndDelete").mockResolvedValueOnce({
        _id: "todo-1",
        userId: testUserId,
      } as any)

      const res = await request(app)
        .delete("/api/todos/todo-1")
        .set("Authorization", `Bearer ${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.message).toBe("Todo deleted successfully")
    })
  })
})
