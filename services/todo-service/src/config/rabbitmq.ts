import { RabbitMQClient, QUEUES } from "@blueprint/shared"

export const rabbitMQClient = new RabbitMQClient({
  url: process.env.RABBITMQ_URL || "amqp://localhost:5672",
  serviceName: "todo-service",
  queues: [QUEUES.TODO_CREATED],
})

export const publishToQueue = async (queue: string, message: object, correlationId?: string) => {
  await rabbitMQClient.publishToQueue(queue, message, { correlationId })
}

export const connectRabbitMQ = async () => rabbitMQClient.connect()
export const closeRabbitMQ = async () => rabbitMQClient.close()
