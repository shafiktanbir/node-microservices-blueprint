import { getTransporter } from "../config/email.config"
import { TodoCreatedEvent, createLogger } from "@blueprint/shared"

const logger = createLogger("email-service")

export interface EmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

// Send email using configured transporter
export const sendEmail = async (options: EmailOptions): Promise<any> => {
  const transporter = getTransporter()

  const mailOptions = {
    from: process.env.EMAIL_FROM || "noreply@blueprint.internal",
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html || options.text,
  }

  const info = await transporter.sendMail(mailOptions)
  logger.info({ messageId: info.messageId, to: options.to, subject: options.subject }, "Email notification sent")
  return info
}

// Format date for notification
export const formatDate = (date?: string | Date): string => {
  if (!date) return "No due date"
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// Render HTML template for todo created notification
export const renderTodoCreatedHtml = (event: TodoCreatedEvent): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2b6cb0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">📋 New Task Created</h2>
      <p>Hello <strong>${event.userName}</strong>,</p>
      <p>A new task has been recorded in your workspace:</p>
      <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #2d3748;">${event.title}</h3>
        ${event.description ? `<p style="color: #4a5568;">${event.description}</p>` : ""}
        <p><strong>Priority:</strong> <span style="text-transform: uppercase; color: ${event.priority === "high" ? "#e53e3e" : "#3182ce"};">${event.priority}</span></p>
        <p><strong>Due Date:</strong> ${formatDate(event.dueDate)}</p>
      </div>
      <p style="color: #718096; font-size: 12px; margin-top: 30px;">
        Sent automatically by Enterprise Microservices Blueprint • Correlation ID: ${event.correlationId || "N/A"}
      </p>
    </div>
  `
}

// Handle todo_created event using Event-Carried State Transfer
export const handleTodoCreated = async (event: TodoCreatedEvent): Promise<void> => {
  logger.info(
    { todoId: event.todoId, userId: event.userId, userEmail: event.userEmail, correlationId: event.correlationId },
    "Processing todo_created notification event"
  )

  const subject = `[Task Created] ${event.title}`
  const text = `Hello ${event.userName},\n\nA new task has been created:\n\nTitle: ${event.title}\nDescription: ${event.description || "N/A"}\nPriority: ${event.priority}\nDue Date: ${formatDate(event.dueDate)}\n\nBest regards,\nYour Microservices Workspace`
  const html = renderTodoCreatedHtml(event)

  await sendEmail({
    to: event.userEmail,
    subject,
    text,
    html,
  })
}
