import winston from 'winston';

const { combine, timestamp, json, errors, printf } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...meta,
  });
});

export const createLogger = (serviceName: string) => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'ISO' }),
      json(),
      logFormat,
    ),
    defaultMeta: {
      service: serviceName,
      environment: process.env.NODE_ENV || 'development',
    },
    transports: [
      new winston.transports.Console({
        format: process.env.NODE_ENV === 'development' 
          ? winston.format.simple() 
          : combine(timestamp(), json()),
      }),
    ],
  });
};

export type Logger = ReturnType<typeof createLogger>;

