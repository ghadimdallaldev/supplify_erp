import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BulkUploadService } from './bulk-upload.service';
import { BulkUploadController } from './bulk-upload.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from '../movements/movements.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
  ],
  providers: [
    BulkUploadService,
    PrismaService,
    MovementsService,
  ],
  controllers: [
    BulkUploadController,
  ],
  exports: [
    BulkUploadService,
  ],
})
export class BulkUploadModule {}
