import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createLogger } from '@supplify/utils';
import { AppModule } from './app.module';

const logger = createLogger('suppliers-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: '*', credentials: true });

  const config = new DocumentBuilder().setTitle('Suppliers Service').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 3004;
  await app.listen(port);
  logger.info(`Suppliers service running on: http://localhost:${port}`);
}

bootstrap();

