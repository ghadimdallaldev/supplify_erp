import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  controllers: [SuppliersController],
  providers: [PrismaService],
})
export class AppModule {}

