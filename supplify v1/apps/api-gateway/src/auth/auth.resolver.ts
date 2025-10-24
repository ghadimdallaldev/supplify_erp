import { Resolver, Query, Context } from '@nestjs/graphql';

// import { UnauthorizedError } from '@supplify/utils';

@Resolver()
export class AuthResolver {
  @Query(() => String)
  async me(@Context() context: { req: { user?: { id: string } } }) {
    if (!context.req.user) {
      throw new Error('Not authenticated');
    }
    return JSON.stringify(context.req.user);
  }

  @Query(() => String)
  hello() {
    return 'Hello from Supplify API Gateway!';
  }
}

