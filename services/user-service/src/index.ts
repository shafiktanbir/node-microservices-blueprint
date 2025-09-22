import express, { Application } from "express"
import cors from "cors"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import { connectDatabase } from "./config/database"
import userRoutes from "./routes/user.routes"
import { correlationIdMiddleware, errorHandlerMiddleware, createLogger } from "@blueprint/shared"

dotenv.config()

const logger = createLogger("user-service")
export const app: Application = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(correlationIdMiddleware)

// Routes
app.use("/api/users", userRoutes)

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "user-service" })
})

// Centralized error handler
app.use(errorHandlerMiddleware(logger))

// Start server
export const startServer = async (): Promise<void> => {
  try {
    await connectDatabase()
    app.listen(PORT, () => {
      logger.info(`User Service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error({ err: error }, "Failed to start User Service")
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== "test") {
  startServer()
}
