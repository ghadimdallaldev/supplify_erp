import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:4000/graphql',
});

const authLink = setContext((_, { headers }) => {
  // Get the authentication token from Keycloak if available
  let token = 'mock-token'; // Default fallback
  
  if (typeof window !== 'undefined') {
    // Try to get token from Keycloak instance
    const keycloak = (window as any).keycloak;
    if (keycloak && keycloak.token) {
      token = keycloak.token;
    } else {
      // Fallback to localStorage for development
      const storedToken = localStorage.getItem('auth-token');
      if (storedToken) {
        token = storedToken;
      }
    }
  }
  
  // Return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "Bearer mock-token",
    }
  }
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
    },
    query: {
      errorPolicy: 'all',
    },
  },
});