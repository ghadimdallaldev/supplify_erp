/**
 * GraphQL Client Utility
 * Centralized GraphQL request handler with error handling
 */

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; extensions?: any }>;
}

export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>,
): Promise<T> {
  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result: GraphQLResponse<T> = await response.json();

  if (result.errors && result.errors.length > 0) {
    const error = result.errors[0];
    
    // Check for specific error types
    if (error.extensions?.code === 'FEATURE_LOCKED') {
      const err = new Error(error.message);
      (err as any).code = 'FEATURE_LOCKED';
      (err as any).requiredTier = error.extensions.requiredTier;
      throw err;
    }

    if (error.extensions?.code === 'LIMIT_EXCEEDED') {
      const err = new Error(error.message);
      (err as any).code = 'LIMIT_EXCEEDED';
      (err as any).limit = error.extensions.limit;
      (err as any).cap = error.extensions.cap;
      throw err;
    }

    throw new Error(error.message || 'GraphQL request failed');
  }

  if (!result.data) {
    throw new Error('No data returned from GraphQL request');
  }

  return result.data;
}

/**
 * Mutation helper with optimistic updates
 */
export async function graphqlMutation<T = any>(
  mutation: string,
  variables?: Record<string, any>,
): Promise<T> {
  return graphqlRequest<T>(mutation, variables);
}

/**
 * Query helper with caching
 */
export async function graphqlQuery<T = any>(
  query: string,
  variables?: Record<string, any>,
): Promise<T> {
  return graphqlRequest<T>(query, variables);
}

