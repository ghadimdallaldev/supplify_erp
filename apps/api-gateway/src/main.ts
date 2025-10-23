import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { createLogger } from '@supplify/utils';

import { AppModule } from './app.module';

const logger = createLogger('api-gateway');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.info(`API Gateway running on: http://localhost:${port}`);
  logger.info(`GraphQL Playground: http://localhost:${port}/graphql`);
}

bootstrap();

