const KcAdminClient = require('@keycloak/keycloak-admin-client').default;

const kcAdminClient = new KcAdminClient({
  baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
  realmName: process.env.KEYCLOAK_REALM || 'master',
});

async function seedKeycloak() {
  try {
    // Authenticate as admin
    await kcAdminClient.auth({
      username: process.env.KEYCLOAK_ADMIN_USER || 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASS || 'admin_password',
      grantType: 'password',
      clientId: 'admin-cli',
    });

    console.log('✅ Authenticated with Keycloak admin');

    // Create Supplify realm if it doesn't exist
    try {
      await kcAdminClient.realms.findOne({ realm: 'Supplify' });
      console.log('✅ Supplify realm already exists');
    } catch (error) {
      // Create realm
      await kcAdminClient.realms.create({
        realm: 'Supplify',
        displayName: 'Supplify ERP',
        displayNameHtml: '<strong>Supplify</strong> ERP',
        enabled: true,
        registrationAllowed: true,
        registrationEmailAsUsername: true,
        rememberMe: true,
        verifyEmail: true,
        loginWithEmailAllowed: true,
        duplicateEmailsAllowed: false,
        resetPasswordAllowed: true,
        editUsernameAllowed: false,
        bruteForceProtected: true,
        passwordPolicy: 'length(8) and digits(1) and lowerCase(1) and upperCase(1) and specialChars(1) and notUsername',
        refreshTokenMaxReuse: 0,
        accessTokenLifespan: 300,
        accessTokenLifespanForImplicitFlow: 900,
        ssoSessionIdleTimeout: 1800,
        ssoSessionMaxLifespan: 36000,
        offlineSessionIdleTimeout: 2592000,
        offlineSessionMaxLifespanEnabled: false,
        offlineSessionMaxLifespan: 5184000,
        accessCodeLifespan: 60,
        accessCodeLifespanUserAction: 300,
        accessCodeLifespanLogin: 1800,
        actionTokenGeneratedByAdminLifespan: 43200,
        actionTokenGeneratedByUserLifespan: 300,
        oauth2DeviceCodeLifespan: 600,
        oauth2DevicePollingInterval: 5,
        internationalizationEnabled: true,
        supportedLocales: ['en'],
        defaultLocale: 'en',
        eventsEnabled: true,
        eventsListeners: ['jboss-logging'],
        enabledEventTypes: ['LOGIN', 'LOGOUT', 'LOGIN_ERROR', 'REGISTER', 'REGISTER_ERROR'],
        adminEventsEnabled: true,
        adminEventsDetailsEnabled: true,
      });
      console.log('✅ Created Supplify realm');
    }

    // Switch to Supplify realm
    kcAdminClient.setConfig({
      realmName: 'Supplify',
    });

    // Create realm roles
    const roles = ['admin', 'supplier', 'restaurant', 'superadmin'];
    for (const roleName of roles) {
      try {
        await kcAdminClient.roles.findOneByName({ name: roleName });
        console.log(`✅ Role ${roleName} already exists`);
      } catch (error) {
        await kcAdminClient.roles.create({
          name: roleName,
          description: `${roleName} role for Supplify ERP`,
        });
        console.log(`✅ Created role ${roleName}`);
      }
    }

    // Create clients
    const clients = [
      {
        clientId: 'supplify-web',
        name: 'Supplify Web App',
        description: 'Next.js web application for restaurants and suppliers',
        enabled: true,
        clientAuthenticatorType: 'client-secret',
        secret: 'web-client-secret',
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: true,
        serviceAccountsEnabled: false,
        publicClient: true,
        frontchannelLogout: true,
        protocol: 'openid-connect',
        redirectUris: [
          'http://localhost:3000/auth/callback/keycloak',
          'http://localhost:3000/auth/signin/callback'
        ],
        webOrigins: ['http://localhost:3000'],
        attributes: {
          'pkce.code.challenge.method': 'S256',
          'post.logout.redirect.uris': '+',
          'oauth2.device.authorization.grant.enabled': 'false',
          'display.on.consent.screen': 'true',
          'backchannel.logout.session.required': 'true',
        }
      },
      {
        clientId: 'supplify-admin',
        name: 'Supplify Admin Console',
        description: 'Admin console for managing users and organizations',
        enabled: true,
        clientAuthenticatorType: 'client-secret',
        secret: 'admin-client-secret',
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: true,
        serviceAccountsEnabled: false,
        publicClient: false,
        frontchannelLogout: true,
        protocol: 'openid-connect',
        redirectUris: [
          'http://localhost:3001/auth/callback/keycloak',
          'http://localhost:3001/auth/signin/callback'
        ],
        webOrigins: ['http://localhost:3001'],
        attributes: {
          'post.logout.redirect.uris': '+',
          'oauth2.device.authorization.grant.enabled': 'false',
          'display.on.consent.screen': 'true',
          'backchannel.logout.session.required': 'true',
        }
      },
      {
        clientId: 'supplify-gateway',
        name: 'Supplify API Gateway',
        description: 'Service account for API Gateway service-to-service authentication',
        enabled: true,
        clientAuthenticatorType: 'client-secret',
        secret: 'gateway-client-secret',
        standardFlowEnabled: false,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
        publicClient: false,
        frontchannelLogout: false,
        protocol: 'openid-connect',
        attributes: {
          'oauth2.device.authorization.grant.enabled': 'false',
          'display.on.consent.screen': 'false',
          'backchannel.logout.session.required': 'false',
        }
      }
    ];

    for (const client of clients) {
      try {
        await kcAdminClient.clients.findOne({ clientId: client.clientId });
        console.log(`✅ Client ${client.clientId} already exists`);
      } catch (error) {
        await kcAdminClient.clients.create(client);
        console.log(`✅ Created client ${client.clientId}`);
      }
    }

    // Create protocol mappers for custom claims
    const webClient = await kcAdminClient.clients.findOne({ clientId: 'supplify-web' });
    
    const mappers = [
      {
        name: 'client_id',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'userinfo.token.claim': 'true',
          'user.attribute': 'client_id',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'claim.name': 'client_id',
          'jsonType.label': 'String'
        }
      },
      {
        name: 'org_type',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'userinfo.token.claim': 'true',
          'user.attribute': 'org_type',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'claim.name': 'org_type',
          'jsonType.label': 'String'
        }
      },
      {
        name: 'tier',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-usermodel-attribute-mapper',
        consentRequired: false,
        config: {
          'userinfo.token.claim': 'true',
          'user.attribute': 'tier',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'claim.name': 'tier',
          'jsonType.label': 'String'
        }
      }
    ];

    for (const mapper of mappers) {
      try {
        await kcAdminClient.clients.createProtocolMapper({
          id: webClient.id,
        }, mapper);
        console.log(`✅ Created protocol mapper ${mapper.name}`);
      } catch (error) {
        console.log(`⚠️  Protocol mapper ${mapper.name} may already exist`);
      }
    }

    console.log('🎉 Keycloak seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding Keycloak:', error);
    process.exit(1);
  }
}

// Run the seeding
seedKeycloak();
