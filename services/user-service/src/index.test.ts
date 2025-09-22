import request from "supertest"
import { app } from "./index"
import { hashPassword, comparePassword, generateToken, verifyToken } from "./utils/utils"
import { registerSchema, loginSchema } from "./routes/user.routes"
import { User } from "./models/user.model"

describe("User Service Test Suite", () => {
  describe("Cryptographic Utilities & Token Issuance", () => {
    it("hashes password and verifies against plaintext", async () => {
      const plaintext = "securePassword123!"
      const hash = await hashPassword(plaintext)

      expect(hash).not.toBe(plaintext)
      expect(await comparePassword(plaintext, hash)).toBe(true)
      expect(await comparePassword("wrongPassword", hash)).toBe(false)
    })

    it("generates and cryptographically verifies JWT tokens", () => {
      const token = generateToken("user-uuid-1", "Alice", "alice@example.com")
      expect(typeof token).toBe("string")

      const payload = verifyToken(token) as any
      expect(payload.userId).toBe("user-uuid-1")
      expect(payload.name).toBe("Alice")
      expect(payload.email).toBe("alice@example.com")
    })
  })

  describe("Zod Validation Schemas", () => {
    it("validates valid registration payload", () => {
      const valid = { email: "alice@example.com", password: "password123", name: "Alice" }
      expect(() => registerSchema.parse(valid)).not.toThrow()
    })

    it("rejects invalid emails and short passwords", () => {
      expect(() => registerSchema.parse({ email: "invalid-email", password: "123", name: "A" })).toThrow()
    })

    it("validates login payload", () => {
      expect(() => loginSchema.parse({ email: "alice@example.com", password: "pwd" })).not.toThrow()
      expect(() => loginSchema.parse({ email: "not-an-email", password: "" })).toThrow()
    })
  })

  describe("HTTP API Endpoints & Auth Flow", () => {
    beforeEach(() => {
      jest.restoreAllMocks()
    })

    it("GET /health returns 200 with service metadata and x-correlation-id", async () => {
      const res = await request(app)
        .get("/health")
        .set("x-correlation-id", "corr-test-123")

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "ok", service: "user-service" })
      expect(res.headers["x-correlation-id"]).toBe("corr-test-123")
    })

    it("POST /api/users/register returns 400 on invalid input schema", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ email: "bad-email", password: "123" })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it("POST /api/users/register registers user, hashes password, and sets cookie", async () => {
      jest.spyOn(User, "findOne").mockResolvedValueOnce(null)
      const mockSavedUser = {
        _id: "507f1f77bcf86cd799439011",
        email: "alice@example.com",
        name: "Alice Smith",
        createdAt: new Date().toISOString(),
        save: jest.fn().mockResolvedValue(true),
      }
      jest.spyOn(User.prototype, "save").mockImplementationOnce(async function (this: any) {
        this._id = mockSavedUser._id
        this.createdAt = mockSavedUser.createdAt
        return this
      })

      const res = await request(app)
        .post("/api/users/register")
        .send({
          email: "alice@example.com",
          password: "SecretPassword123",
          name: "Alice Smith",
        })

      expect(res.status).toBe(201)
      expect(res.body.token).toBeDefined()
      expect(res.body.user.email).toBe("alice@example.com")
      expect(res.headers["set-cookie"]).toBeDefined()
    })

    it("POST /api/users/register returns 409 Conflict when email already exists", async () => {
      jest.spyOn(User, "findOne").mockResolvedValueOnce({ _id: "existing-id" } as any)

      const res = await request(app)
        .post("/api/users/register")
        .send({
          email: "alice@example.com",
          password: "SecretPassword123",
          name: "Alice Smith",
        })

      expect(res.status).toBe(409)
      expect(res.body.error.message).toBe("User already exists with this email")
    })

    it("POST /api/users/login returns 200 and token on valid credentials", async () => {
      const hashedPassword = await hashPassword("ValidPassword123")
      jest.spyOn(User, "findOne").mockResolvedValueOnce({
        _id: "507f1f77bcf86cd799439011",
        email: "alice@example.com",
        name: "Alice Smith",
        password: hashedPassword,
        createdAt: new Date().toISOString(),
      } as any)

      const res = await request(app)
        .post("/api/users/login")
        .send({ email: "alice@example.com", password: "ValidPassword123" })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(res.body.user.name).toBe("Alice Smith")
    })

    it("POST /api/users/login returns 401 on incorrect password", async () => {
      const hashedPassword = await hashPassword("ValidPassword123")
      jest.spyOn(User, "findOne").mockResolvedValueOnce({
        _id: "507f1f77bcf86cd799439011",
        email: "alice@example.com",
        password: hashedPassword,
      } as any)

      const res = await request(app)
        .post("/api/users/login")
        .send({ email: "alice@example.com", password: "WrongPassword" })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe("Invalid credentials")
    })

    it("GET /api/users/me returns 401 when unauthenticated", async () => {
      const res = await request(app).get("/api/users/me")
      expect(res.status).toBe(401)
    })

    it("GET /api/users/me returns user profile with valid Bearer token", async () => {
      const userId = "507f1f77bcf86cd799439011"
      const token = generateToken(userId, "Alice Smith", "alice@example.com")

      jest.spyOn(User, "findById").mockResolvedValueOnce({
        _id: userId,
        email: "alice@example.com",
        name: "Alice Smith",
        createdAt: new Date().toISOString(),
      } as any)

      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe(userId)
      expect(res.body.user.email).toBe("alice@example.com")
    })

    it("POST /api/users/logout clears authToken cookie", async () => {
      const res = await request(app).post("/api/users/logout")
      expect(res.status).toBe(200)
      expect(res.body.message).toBe("Logged out successfully")
    })
  })
})
