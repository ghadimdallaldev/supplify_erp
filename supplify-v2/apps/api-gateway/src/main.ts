import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { ErrorFilter } from './common/filters/error.filter';
import { LoggerService } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false, // We'll use our custom logger
    }),
  );

  const configService = app.get(ConfigService);
  const logger = app.get(LoggerService);

  // Global middleware
  app.use(new TenantContextMiddleware().use);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new ErrorFilter(logger));

  // CORS
  app.enableCors({
    origin: ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Supplify API')
    .setDescription('Supplify API Gateway')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT', 4000);
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Supplify API Gateway running on http://localhost:${port}`);
  logger.log(`📚 API Documentation available at http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
