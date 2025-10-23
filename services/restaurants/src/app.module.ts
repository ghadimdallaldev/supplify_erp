import { Module } from '@nestjs/common';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { PrismaModule } from './prisma/prisma.module';
import { PinsModule } from './pins/pins.module';

@Module({
  imports: [PrismaModule, RestaurantsModule, PinsModule],
})
export class AppModule {}

