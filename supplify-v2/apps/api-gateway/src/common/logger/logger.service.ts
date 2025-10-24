import { Injectable, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pino from 'pino';

@Injectable()
export class LoggerService {
  private logger: pino.Logger;

  constructor(private configService: ConfigService) {
    const isDevelopment = this.configService.get('NODE_ENV') === 'development';
    
    this.logger = pino({
      level: this.configService.get('LOG_LEVEL', 'info'),
      transport: isDevelopment ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      } : undefined,
    });
  }

  log(message: string, context?: string) {
    this.logger.info({ context }, message);
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error({ context, trace }, message);
  }

  warn(message: string, context?: string) {
    this.logger.warn({ context }, message);
  }

  debug(message: string, context?: string) {
    this.logger.debug({ context }, message);
  }

  verbose(message: string, context?: string) {
    this.logger.trace({ context }, message);
  }

  // Custom method for request logging
  logRequest(requestId: string, method: string, url: string, userId?: string, clientId?: string) {
    this.logger.info({
      requestId,
      method,
      url,
      userId,
      clientId,
      type: 'request',
    }, `${method} ${url}`);
  }

  // Custom method for response logging
  logResponse(requestId: string, statusCode: number, responseTime: number, userId?: string, clientId?: string) {
    this.logger.info({
      requestId,
      statusCode,
      responseTime,
      userId,
      clientId,
      type: 'response',
    }, `Response ${statusCode} in ${responseTime}ms`);
  }
}
