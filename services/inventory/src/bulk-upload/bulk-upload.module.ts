import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BulkUploadService } from './bulk-upload.service';
import { BulkUploadController } from './bulk-upload.controller';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
    MovementsModule,
  ],
  providers: [
    BulkUploadService,
  ],
  controllers: [
    BulkUploadController,
  ],
  exports: [
    BulkUploadService,
  ],
})
export class BulkUploadModule {}
