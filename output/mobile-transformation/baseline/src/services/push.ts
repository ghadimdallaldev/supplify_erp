import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

export type PushPlatform = 'ios' | 'android'

const ANDROID_CHANNEL_ID = 'supplify-alerts'
const STORED_EXPO_PUSH_TOKEN_KEY = 'supplify.expoPushToken.v1'

/** Remote push is not supported in Expo Go (SDK 53+); use a native EAS build. */
export function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  )
}

/**
 * Why remote push cannot run on this install, or null when it can.
 * Prefer executionEnvironment over isDevice alone — some phones mis-report isDevice.
 */
export function getPushUnavailableReason(): string | null {
  if (Platform.OS === 'web') {
    return 'Remote push is not available in the web app.'
  }
  if (isExpoGo()) {
    return 'This session is Expo Go. Install the Supplify APK from EAS (not Expo Go) to enable remote push.'
  }
  const env = Constants.executionEnvironment
  const isNativeBuild =
    env === ExecutionEnvironment.Standalone || env === ExecutionEnvironment.Bare
  if (Constants.isDevice === false && !isNativeBuild) {
    return 'Remote push requires a physical device. Emulators/simulators cannot register for push.'
  }
  return null
}

export function isPushAvailable(): boolean {
  return getPushUnavailableReason() === null
}

/** Compact runtime fingerprint for Notification settings diagnostics. */
export function getPushRuntimeLabel(): string {
  const ownership = Constants.appOwnership ?? 'unknown'
  const env = Constants.executionEnvironment ?? 'unknown'
  const device = Constants.isDevice ? 'device' : 'non-device'
  return `${ownership}/${env}/${device}`
}

export function getPushPlatform(): PushPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android'
}

export async function getStoredExpoPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORED_EXPO_PUSH_TOKEN_KEY)
  } catch {
    return null
  }
}

export async function clearStoredExpoPushToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORED_EXPO_PUSH_TOKEN_KEY)
  } catch {
    // SecureStore may be unavailable during native teardown.
  }
}

/** Stop this signed-out installation from receiving remote notifications. */
export async function unregisterNativePushToken(): Promise<void> {
  if (!isPushAvailable()) return
  try {
    const Notifications = await import('expo-notifications')
    await Notifications.unregisterForNotificationsAsync()
  } catch {
    // Server-side deletion remains the primary revocation path.
  }
}

let handlerConfigured = false
let channelConfigured = false

/** Configure foreground presentation and Android notification channel. */
export async function configurePushPresentation(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications')

    if (!handlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      })
      handlerConfigured = true
    }

    if (Platform.OS === 'android' && !channelConfigured) {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Supplify alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableVibrate: true,
      })
      channelConfigured = true
    }
  } catch {
    // expo-notifications may be unavailable on web.
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!isPushAvailable()) return null

  await configurePushPresentation()
  const Notifications = await import('expo-notifications')

  const hasPermission = (permission: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>) => {
    if (Platform.OS !== 'ios') return permission.status === 'granted'
    const iosStatus = permission.ios?.status
    return (
      iosStatus != null &&
      [
        Notifications.IosAuthorizationStatus.AUTHORIZED,
        Notifications.IosAuthorizationStatus.PROVISIONAL,
        Notifications.IosAuthorizationStatus.EPHEMERAL,
      ].includes(iosStatus)
    )
  }

  let permission = await Notifications.getPermissionsAsync()
  if (!hasPermission(permission)) {
    permission = await Notifications.requestPermissionsAsync(
      Platform.OS === 'android'
        ? {
            android: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          }
        : undefined
    )
  }
  if (!hasPermission(permission)) return null

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    throw new Error('This build is missing its Expo project ID.')
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: String(projectId),
  })
  if (!token.data) {
    throw new Error('Expo did not return a push token for this device.')
  }

  await SecureStore.setItemAsync(STORED_EXPO_PUSH_TOKEN_KEY, token.data)
  return token.data
}
