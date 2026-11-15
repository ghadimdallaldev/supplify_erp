/**
 * Thin string layer for redesigned UI.
 * Arabic is used when the device is already in RTL, or after setAppLocale('ar').
 */
import { I18nManager } from 'react-native'

type Locale = 'en' | 'ar'

let locale: Locale = I18nManager.isRTL ? 'ar' : 'en'

export function setAppLocale(next: Locale) {
  locale = next
}

export function isRtl() {
  return I18nManager.isRTL || locale === 'ar'
}

const en = {
  home: 'Home',
  today: 'Today',
  orders: 'Orders',
  suppliers: 'Suppliers',
  messages: 'Messages',
  dispatch: 'Dispatch',
  more: 'More',
  needsAttention: 'Needs attention',
  happeningToday: 'Today',
  upNext: 'Up next',
  recent: 'Recent',
  noOpenOrders: 'No open orders',
  loading: 'Loading…',
  retry: 'Try again',
  couldNotLoad: 'Could not load data',
  welcomeBack: 'Welcome back',
  signInSubtitle: 'Sign in to your workspace to continue.',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  securedBySso: 'Secured by Keycloak SSO',
  tagline: 'Orders, deliveries, and tracking on the go.',
  featureOrders: 'Track orders end to end',
  featureTracking: 'Live delivery tracking',
  featureFulfillment: 'Fulfillment on the go',
} as const

const ar: Partial<Record<keyof typeof en, string>> = {
  home: 'الرئيسية',
  today: 'اليوم',
  orders: 'الطلبات',
  suppliers: 'الموردون',
  messages: 'الرسائل',
  dispatch: 'التوزيع',
  more: 'المزيد',
  needsAttention: 'يحتاج إلى انتباه',
  happeningToday: 'اليوم',
  upNext: 'التالي',
  recent: 'الأخيرة',
  noOpenOrders: 'لا توجد طلبات مفتوحة',
  loading: 'جارٍ التحميل…',
  retry: 'إعادة المحاولة',
  couldNotLoad: 'تعذر تحميل البيانات',
  welcomeBack: 'مرحباً بعودتك',
  signInSubtitle: 'سجّل الدخول إلى مساحة عملك للمتابعة.',
  signIn: 'تسجيل الدخول',
  signingIn: 'جارٍ تسجيل الدخول…',
  securedBySso: 'محمي عبر Keycloak SSO',
  tagline: 'الطلبات والتوصيل والتتبع أثناء التنقل.',
  featureOrders: 'تتبع الطلبات من البداية إلى النهاية',
  featureTracking: 'تتبع التوصيل مباشرة',
  featureFulfillment: 'تنفيذ الطلبات أثناء التنقل',
}

export function t(key: keyof typeof en): string {
  if (locale === 'ar' && ar[key]) return ar[key] as string
  return en[key]
}
