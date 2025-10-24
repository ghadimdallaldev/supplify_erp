import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Transport } from '@nestjs/microservices';

import { createLogger } from '@supplify/utils';

import { AppModule } from './app.module';

const logger = createLogger('restaurants-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: '*', credentials: true });

  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
      queue: 'restaurants_queue',
      queueOptions: { durable: true },
    },
  });

  const config = new DocumentBuilder()
    .setTitle('Restaurants Service')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.startAllMicroservices();
  const port = process.env.PORT || 3003;
  await app.listen(port);
  logger.info(`Restaurants service running on: http://localhost:${port}`);
}

bootstrap();

