import { NestFactory } from '@nestjs/core';
import { createLogger } from '@supplify/utils';
import { AppModule } from './app.module';

const logger = createLogger('analytics-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3008;
  await app.listen(port);
  logger.info(`Analytics service running on: http://localhost:${port}`);
}

bootstrap();

