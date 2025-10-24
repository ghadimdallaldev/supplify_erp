import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { InventoryResolver } from './inventory.resolver';
import { ItemsModule } from '../items/items.module';
import { MovementsModule } from '../movements/movements.module';
import { CountsModule } from '../counts/counts.module';
import { RecipesModule } from '../recipes/recipes.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: ['./**/*.graphql'],
      definitions: {
        path: join(process.cwd(), 'src/graphql/graphql.ts'),
      },
      playground: process.env.NODE_ENV !== 'production',
      introspection: true,
    }),
    ItemsModule,
    MovementsModule,
    CountsModule,
    RecipesModule,
    CommonModule,
  ],
  providers: [InventoryResolver],
})
export class GraphQLModule {}

