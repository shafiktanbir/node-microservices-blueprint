import request from "supertest"
import { app } from "./index"
import {
  formatDate,
  renderTodoCreatedHtml,
  handleTodoCreated,
  sendEmail,
} from "./services/email.service"
import * as emailConfig from "./config/email.config"
import { TodoCreatedEvent, TodoCreatedEventSchema } from "@blueprint/shared"

describe("Email Service Test Suite", () => {
  const sampleEvent: TodoCreatedEvent = {
    todoId: "todo-abc-123",
    userId: "user-xyz-789",
    userName: "Bob Builder",
    userEmail: "bob@example.com",
    title: "Implement Kafka Choreography",
    description: "Connect microservices via resilient queues",
    priority: "high",
    dueDate: "2026-12-31T23:59:59.000Z",
    createdAt: "2026-10-03T10:00:00.000Z",
    correlationId: "corr-email-test-01",
  }

  describe("Utility & Template Rendering", () => {
    it("formatDate handles undefined and valid dates correctly", () => {
      expect(formatDate(undefined)).toBe("No due date")
      expect(formatDate("2026-05-15T00:00:00.000Z")).toContain("2026")
    })

    it("renderTodoCreatedHtml generates styled notification with event metadata", () => {
      const html = renderTodoCreatedHtml(sampleEvent)
      expect(html).toContain("Bob Builder")
      expect(html).toContain("Implement Kafka Choreography")
      expect(html).toContain("Connect microservices via resilient queues")
      expect(html).toContain("high")
      expect(html).toContain("corr-email-test-01")
    })
  })

  describe("Event Processing & Email Dispatch", () => {
    let mockSendMail: jest.Mock

    beforeEach(() => {
      jest.restoreAllMocks()
      mockSendMail = jest.fn().mockResolvedValue({
        messageId: "<mock-msg-id-1234@blueprint.internal>",
      })
      jest.spyOn(emailConfig, "getTransporter").mockReturnValue({
        sendMail: mockSendMail,
      } as any)
    })

    it("validates event against TodoCreatedEventSchema", () => {
      const parsed = TodoCreatedEventSchema.parse(sampleEvent)
      expect(parsed.userEmail).toBe("bob@example.com")
      expect(parsed.title).toBe("Implement Kafka Choreography")
    })

    it("rejects invalid event missing email or title", () => {
      expect(() =>
        TodoCreatedEventSchema.parse({
          todoId: "123",
          userId: "456",
          userEmail: "invalid-email",
        })
      ).toThrow()
    })

    it("sendEmail calls transporter.sendMail with proper headers", async () => {
      const result = await sendEmail({
        to: "recipient@example.com",
        subject: "Test Subject",
        text: "Plain text content",
        html: "<p>HTML content</p>",
      })

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "recipient@example.com",
          subject: "Test Subject",
          text: "Plain text content",
          html: "<p>HTML content</p>",
        })
      )
      expect(result.messageId).toBe("<mock-msg-id-1234@blueprint.internal>")
    })

    it("handleTodoCreated processes event-carried state and sends email", async () => {
      await handleTodoCreated(sampleEvent)

      expect(mockSendMail).toHaveBeenCalledTimes(1)
      const callArg = mockSendMail.mock.calls[0][0]
      expect(callArg.to).toBe("bob@example.com")
      expect(callArg.subject).toBe("[Task Created] Implement Kafka Choreography")
      expect(callArg.text).toContain("Bob Builder")
      expect(callArg.html).toContain("Implement Kafka Choreography")
    })
  })

  describe("HTTP Health API", () => {
    it("GET /health returns 200 with service metadata and x-correlation-id", async () => {
      const res = await request(app)
        .get("/health")
        .set("x-correlation-id", "corr-health-test")

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "ok", service: "email-service" })
      expect(res.headers["x-correlation-id"]).toBe("corr-health-test")
    })
  })
})
