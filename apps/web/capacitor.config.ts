import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.supplify.driver',
  appName: 'Supplify Driver',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' },
}

export default config
