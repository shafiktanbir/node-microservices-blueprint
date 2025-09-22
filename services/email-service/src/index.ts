import express, { Application } from "express"
import cors from "cors"
import dotenv from "dotenv"
import { initializeEmailTransporter } from "./config/email.config"
import {
  closeRabbitMQ,
  connectRabbitMQ,
  consumeFromQueue,
} from "./config/rabbitmq"
import { correlationIdMiddleware, errorHandlerMiddleware, createLogger } from "@blueprint/shared"

dotenv.config()

const logger = createLogger("email-service")
export const app: Application = express()
const PORT = process.env.PORT || 3003

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(correlationIdMiddleware)

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "email-service" })
})

// Centralized error handling
app.use(errorHandlerMiddleware(logger))

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down Email Service...")
  await closeRabbitMQ()
  process.exit(0)
})

// Start server
export const startServer = async (): Promise<void> => {
  try {
    initializeEmailTransporter()
    await connectRabbitMQ()
    await consumeFromQueue()
    app.listen(PORT, () => {
      logger.info(`Email Service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error({ err: error }, "Failed to start Email Service")
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== "test") {
  startServer()
}
