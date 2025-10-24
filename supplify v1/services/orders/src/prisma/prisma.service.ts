import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { createLogger } from '@supplify/utils';

const logger = createLogger('prisma-orders');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    logger.info('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

