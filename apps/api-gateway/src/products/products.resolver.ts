import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Resolver()
export class ProductsResolver {
  constructor(@Inject('CATALOG_SERVICE') private catalogClient: ClientProxy) {}

  @Query(() => String)
  async products(
    @Args('query', { nullable: true }) query?: string,
    @Args('page', { nullable: true }) page?: number,
    @Args('limit', { nullable: true }) limit?: number,
  ) {
    const result = await firstValueFrom(
      this.catalogClient.send('catalog.products.search', {
        query,
        page: page || 1,
        limit: limit || 20,
      }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async product(@Args('id') id: string) {
    const result = await firstValueFrom(
      this.catalogClient.send('catalog.product.find', { id }),
    );
    return JSON.stringify(result);
  }
}

