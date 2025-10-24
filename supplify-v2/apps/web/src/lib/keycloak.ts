import Keycloak from 'keycloak-js';

const keycloakConfig = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'Supplify',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'supplify-web',
};

let keycloakInstance: Keycloak | null = null;

export const getKeycloakInstance = (): Keycloak => {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak(keycloakConfig);
  }
  return keycloakInstance;
};

export const initKeycloak = async (): Promise<Keycloak> => {
  const keycloak = getKeycloakInstance();
  
  try {
    const authenticated = await keycloak.init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
    
    if (!authenticated) {
      throw new Error('Authentication failed');
    }
    
    return keycloak;
  } catch (error) {
    console.error('Keycloak initialization failed:', error);
    throw error;
  }
};
