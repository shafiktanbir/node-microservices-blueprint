import pino, { Logger, LoggerOptions } from 'pino';

export interface CreateLoggerOptions extends LoggerOptions {
  serviceName: string;
}

export const createLogger = (options: string | CreateLoggerOptions): Logger => {
  const serviceName = typeof options === 'string' ? options : options.serviceName;
  const extraOptions = typeof options === 'string' ? {} : options;

  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  return pino({
    level: logLevel,
    base: {
      service: serviceName,
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    ...extraOptions,
  });
};

export type { Logger };
