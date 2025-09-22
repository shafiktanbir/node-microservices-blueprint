import {
  RabbitMQClient,
  QUEUES,
  TodoCreatedEventSchema,
  createLogger,
} from "@blueprint/shared"
import { handleTodoCreated } from "../services/email.service"

const logger = createLogger("email-service")

export const rabbitMQClient = new RabbitMQClient({
  url: process.env.RABBITMQ_URL || "amqp://localhost:5672",
  serviceName: "email-service",
  queues: [
    {
      name: QUEUES.TODO_CREATED,
      deadLetterExchange: "",
      deadLetterRoutingKey: QUEUES.TODO_CREATED_DLQ,
    },
    {
      name: QUEUES.TODO_CREATED_DLQ,
    },
  ],
})

export const consumeFromQueue = async (): Promise<void> => {
  await rabbitMQClient.consumeFromQueue(
    QUEUES.TODO_CREATED,
    async (payload: unknown) => {
      logger.info({ payload }, "Received message from todo_created queue")
      const validatedEvent = TodoCreatedEventSchema.parse(payload)
      await handleTodoCreated(validatedEvent)
    },
    {
      noAck: false,
      maxRetries: 3,
      requeueOnError: false, // route to DLQ after retries
    }
  )
}

export const connectRabbitMQ = async () => rabbitMQClient.connect()
export const closeRabbitMQ = async () => rabbitMQClient.close()
