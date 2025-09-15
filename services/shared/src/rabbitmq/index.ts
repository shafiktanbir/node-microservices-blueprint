import amqp, { ChannelModel, Channel, Options, ConsumeMessage } from 'amqplib';
import { Logger, createLogger } from '../logger';

export interface QueueConfig {
  name: string;
  durable?: boolean;
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
  messageTtl?: number;
  autoDelete?: boolean;
}

export interface DLQConfig {
  mainQueue: string;
  deadLetterExchange?: string;
  deadLetterQueue?: string;
  routingKey?: string;
}

export interface RabbitMQClientOptions {
  url?: string;
  serviceName?: string;
  queues?: Array<string | QueueConfig>;
  dlqs?: DLQConfig[];
  reconnectIntervalMs?: number;
  maxReconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  logger?: Logger;
}

export interface PublishOptions extends Options.Publish {
  correlationId?: string;
}

export interface ConsumerOptions {
  noAck?: boolean;
  maxRetries?: number;
  requeueOnError?: boolean;
}

export class RabbitMQClient {
  private url: string;
  private serviceName: string;
  private queuesConfig: Array<string | QueueConfig>;
  private dlqsConfig: DLQConfig[];
  private reconnectIntervalMs: number;
  private maxReconnectIntervalMs: number;
  private maxReconnectAttempts: number;
  private logger: Logger;

  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isConnecting: boolean = false;
  private isClosing: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Track active consumers to re-subscribe after auto-reconnect
  private registeredConsumers: Map<
    string,
    {
      handler: (data: any, msg: ConsumeMessage) => Promise<void>;
      options: ConsumerOptions;
    }
  > = new Map();

  constructor(options: RabbitMQClientOptions = {}) {
    this.url = options.url || process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.serviceName = options.serviceName || 'Service';
    this.queuesConfig = options.queues || [];
    this.dlqsConfig = options.dlqs || [];
    this.reconnectIntervalMs = options.reconnectIntervalMs || 1000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs || 30000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || Infinity;
    this.logger = options.logger || createLogger(this.serviceName);
  }

  public async connect(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.isClosing = false;

    try {
      this.logger.info(
        { url: this.url.replace(/:\/\/.*@/, '://***:***@') },
        `[${this.serviceName}] Connecting to RabbitMQ...`
      );

      const conn = await amqp.connect(this.url);
      this.connection = conn;

      conn.on('error', (err) => {
        this.logger.error({ err: err.message }, `[${this.serviceName}] RabbitMQ connection error`);
        this.handleDisconnect();
      });

      conn.on('close', () => {
        if (!this.isClosing) {
          this.logger.warn(`[${this.serviceName}] RabbitMQ connection closed unexpectedly`);
          this.handleDisconnect();
        }
      });

      const chan = await conn.createChannel();
      this.channel = chan;

      chan.on('error', (err) => {
        this.logger.error({ err: err.message }, `[${this.serviceName}] RabbitMQ channel error`);
      });

      chan.on('close', () => {
        this.logger.warn(`[${this.serviceName}] RabbitMQ channel closed`);
      });

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.logger.info(`[${this.serviceName}] RabbitMQ connected & channel established`);

      // Initialize declared DLQs and queues
      await this.setupConfiguredQueues();

      // Re-establish registered consumers if reconnected
      await this.restoreConsumers();
    } catch (error) {
      this.isConnecting = false;
      const err = error as Error;
      this.logger.error({ err: err.message }, `[${this.serviceName}] Failed to connect to RabbitMQ`);
      this.scheduleReconnect();
      throw error;
    }
  }

  private handleDisconnect(): void {
    this.connection = null;
    this.channel = null;
    if (!this.isClosing) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosing || this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        { attempts: this.reconnectAttempts },
        `[${this.serviceName}] Reached max RabbitMQ reconnect attempts. Giving up.`
      );
      return;
    }

    this.reconnectAttempts += 1;
    // Exponential backoff: base * 1.5^(attempt-1), capped at max
    const backoff = Math.min(
      this.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectIntervalMs
    );
    // Add jitter +/- 20%
    const jitter = backoff * (0.8 + Math.random() * 0.4);

    this.logger.info(
      { attempt: this.reconnectAttempts, retryInMs: Math.round(jitter) },
      `[${this.serviceName}] Scheduling RabbitMQ reconnect...`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // next attempt will be scheduled in scheduleReconnect
      }
    }, jitter);
  }

  public async setupDeadLetterQueue(config: DLQConfig): Promise<void> {
    if (!this.channel) {
      throw new Error(`[${this.serviceName}] RabbitMQ channel not available`);
    }

    const dlx = config.deadLetterExchange || `dlx.${config.mainQueue}`;
    const dlq = config.deadLetterQueue || `${config.mainQueue}.dlq`;
    const routingKey = config.routingKey || `${config.mainQueue}.dlq`;

    // 1. Assert Dead-Letter Exchange (direct)
    await this.channel.assertExchange(dlx, 'direct', { durable: true });

    // 2. Assert Dead-Letter Queue
    await this.channel.assertQueue(dlq, { durable: true });

    // 3. Bind Dead-Letter Queue to Dead-Letter Exchange
    await this.channel.bindQueue(dlq, dlx, routingKey);

    // 4. Assert Main Queue with dead-letter attributes pointing to DLX
    await this.channel.assertQueue(config.mainQueue, {
      durable: true,
      deadLetterExchange: dlx,
      deadLetterRoutingKey: routingKey,
    });

    this.logger.info(
      { mainQueue: config.mainQueue, dlx, dlq, routingKey },
      `[${this.serviceName}] Configured queue with DLX/DLQ bindings`
    );
  }

  private async setupConfiguredQueues(): Promise<void> {
    if (!this.channel) return;

    for (const dlqConfig of this.dlqsConfig) {
      await this.setupDeadLetterQueue(dlqConfig);
    }

    for (const q of this.queuesConfig) {
      if (typeof q === 'string') {
        await this.channel.assertQueue(q, { durable: true });
      } else {
        await this.channel.assertQueue(q.name, {
          durable: q.durable ?? true,
          deadLetterExchange: q.deadLetterExchange,
          deadLetterRoutingKey: q.deadLetterRoutingKey,
          messageTtl: q.messageTtl,
          autoDelete: q.autoDelete ?? false,
        });
      }
    }
  }

  private async restoreConsumers(): Promise<void> {
    for (const [queue, { handler, options }] of this.registeredConsumers.entries()) {
      this.logger.info({ queue }, `[${this.serviceName}] Restoring consumer for queue`);
      await this.consumeFromQueue(queue, handler, options, true);
    }
  }

  public async publishToQueue(
    queue: string,
    message: unknown,
    options: PublishOptions = {}
  ): Promise<boolean> {
    try {
      if (!this.channel) {
        throw new Error(`[${this.serviceName}] RabbitMQ channel not available for publishing`);
      }

      await this.channel.assertQueue(queue, { durable: true });

      const correlationId = options.correlationId || (message as any)?.correlationId;
      const headers = {
        ...(options.headers || {}),
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      };

      const payload = Buffer.from(JSON.stringify(message));
      const sent = this.channel.sendToQueue(queue, payload, {
        persistent: true,
        contentType: 'application/json',
        correlationId,
        headers,
        ...options,
      });

      this.logger.debug(
        { queue, correlationId, sent },
        `[${this.serviceName}] Message published to queue`
      );
      return sent;
    } catch (error) {
      const err = error as Error;
      this.logger.error({ err: err.message, queue }, `[${this.serviceName}] Error publishing to queue`);
      throw error;
    }
  }

  public async consumeFromQueue<T = any>(
    queue: string,
    handler: (data: T, msg: ConsumeMessage) => Promise<void>,
    options: ConsumerOptions = {},
    isRestoring: boolean = false
  ): Promise<void> {
    if (!isRestoring) {
      this.registeredConsumers.set(queue, { handler, options });
    }

    if (!this.channel) {
      throw new Error(`[${this.serviceName}] RabbitMQ channel not available for consuming`);
    }

    await this.channel.assertQueue(queue, { durable: true });

    await this.channel.consume(
      queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        const correlationId =
          msg.properties.correlationId ||
          msg.properties.headers?.['x-correlation-id']?.toString();

        try {
          const rawContent = msg.content.toString('utf-8');
          const data = JSON.parse(rawContent);

          await handler(data, msg);

          if (!options.noAck && this.channel) {
            this.channel.ack(msg);
          }
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            { err: err.message, queue, correlationId },
            `[${this.serviceName}] Error processing message from queue`
          );

          if (!options.noAck && this.channel) {
            // If requeueOnError is false or not specified, nack without requeue
            // This triggers Dead Letter Exchange routing if configured
            const requeue = options.requeueOnError ?? false;
            this.channel.nack(msg, false, requeue);
          }
        }
      },
      { noAck: options.noAck ?? false }
    );

    this.logger.info({ queue }, `[${this.serviceName}] Subscribed to queue`);
  }

  public isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  public getChannel(): Channel | null {
    return this.channel;
  }

  public getConnection(): ChannelModel | null {
    return this.connection;
  }

  public async close(): Promise<void> {
    this.isClosing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.info(`[${this.serviceName}] RabbitMQ connection closed cleanly`);
    } catch (error) {
      const err = error as Error;
      this.logger.error({ err: err.message }, `[${this.serviceName}] Error closing RabbitMQ connection`);
    }
  }

  public setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`[${this.serviceName}] Received ${signal}, closing RabbitMQ client...`);
      await this.close();
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }
}

export default RabbitMQClient;
