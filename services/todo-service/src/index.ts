import express, { Application } from "express"
import cors from "cors"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import { connectDatabase } from "./config/database"
import todoRoutes from "./routes/todo.routes"
import { closeRabbitMQ, connectRabbitMQ } from "./config/rabbitmq"
import { correlationIdMiddleware, errorHandlerMiddleware, createLogger } from "@blueprint/shared"

dotenv.config()

const logger = createLogger("todo-service")
export const app: Application = express()
const PORT = process.env.PORT || 3002

// Middleware
app.use(cors())
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(correlationIdMiddleware)

// Health check endpoint (public, unauthenticated)
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "todo-service" })
})

// Routes
app.use("/api/todos", todoRoutes)

// Centralized error handling middleware
app.use(errorHandlerMiddleware(logger))

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down Todo Service...")
  await closeRabbitMQ()
  process.exit(0)
})

// Start server
export const startServer = async (): Promise<void> => {
  try {
    await connectDatabase()
    await connectRabbitMQ()
    app.listen(PORT, () => {
      logger.info(`Todo Service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error({ err: error }, "Failed to start Todo Service")
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== "test") {
  startServer()
}
