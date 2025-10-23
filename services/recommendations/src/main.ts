import { NestFactory } from '@nestjs/core';
import { createLogger } from '@supplify/utils';
import { AppModule } from './app.module';

const logger = createLogger('recommendations-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3006;
  await app.listen(port);
  logger.info(`Recommendations service running on: http://localhost:${port}`);
}

bootstrap();

