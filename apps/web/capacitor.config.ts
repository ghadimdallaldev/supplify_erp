import type { CapacitorConfig } from '@capacitor/cli'

const hostedAppUrl = process.env.CAPACITOR_SERVER_URL?.trim().replace(/\/$/, '')
const trustedAuthHosts = process.env.CAPACITOR_AUTH_HOSTS?.split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const config: CapacitorConfig = {
  appId: 'com.supplify.driver',
  appName: 'Supplify Driver',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    ...(hostedAppUrl
      ? {
          url: hostedAppUrl,
          allowNavigation: trustedAuthHosts,
        }
      : {}),
  },
}

export default config
