import nodemailer, { Transporter } from 'nodemailer';
import { createLogger } from '@blueprint/shared';

const logger = createLogger('email-service');
let transporter: Transporter | null = null;

// Initialize email transporter with production SMTP or fallback test/json transport
export const initializeEmailTransporter = (): Transporter => {
  if (transporter) {
    return transporter;
  }

  try {
    const hasSmtpConfig = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD;

    if (hasSmtpConfig) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
      logger.info('Email transporter initialized with SMTP server');
    } else {
      // In-memory JSON/stream transport fallback for dev/test environments
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      logger.info('Email transporter initialized with development fallback transport');
    }

    return transporter;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize email transporter, falling back to JSON transport');
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
};

export const getTransporter = (): Transporter => {
  if (!transporter) {
    return initializeEmailTransporter();
  }
  return transporter;
};
