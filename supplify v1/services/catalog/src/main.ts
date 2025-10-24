import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Transport } from '@nestjs/microservices';

import { createLogger } from '@supplify/utils';

import { AppModule } from './app.module';

const logger = createLogger('catalog-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Microservice transport (RabbitMQ)
  const rabbitMqUrl = process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672';
  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitMqUrl],
      queue: 'catalog_queue',
      queueOptions: {
        durable: true,
      },
      noAck: false,
    },
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Catalog Service API')
    .setDescription('Product catalog and categories management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.startAllMicroservices();

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.info(`Catalog service is running on: http://localhost:${port}`);
  logger.info(`Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();

