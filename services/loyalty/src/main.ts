import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { createLogger } from '@supplify/utils';
import { AppModule } from './app.module';

const logger = createLogger('loyalty-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
      queue: 'loyalty_queue',
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  const port = process.env.PORT || 3005;
  await app.listen(port);
  logger.info(`Loyalty service running on: http://localhost:${port}`);
}

bootstrap();

