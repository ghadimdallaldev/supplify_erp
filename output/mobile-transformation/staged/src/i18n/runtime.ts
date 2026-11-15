import { useSyncExternalStore } from "react";
import { I18nManager, Platform } from "react-native";
import ar from "./ar.json";
export type AppLocale = "en" | "ar";
let locale: AppLocale = I18nManager.isRTL ? "ar" : "en";
let preferred = false;
let initialized = false;
let revision = 0;
const preferenceKey = "supplify_app_locale";
const listeners = new Set<() => void>();
export function setAppLocale(
  next: AppLocale,
  options: { persist?: boolean } = {},
) {
  if (options.persist === false && preferred) return;
  if (options.persist !== false) revision++;
  if (options.persist !== false) {
    preferred = true;
    void (async () => {
      try {
        if (Platform.OS === "web") localStorage.setItem(preferenceKey, next);
        else
          await (
            await import("expo-secure-store")
          ).setItemAsync(preferenceKey, next);
      } catch {}
    })();
  }
  if (next === locale) return;
  locale = next;
  listeners.forEach((listener) => listener());
}
export async function initializeAppLocale() {
  if (initialized) return;
  initialized = true;
  const startedAt = revision;
  try {
    const value =
      Platform.OS === "web"
        ? localStorage.getItem(preferenceKey)
        : await (await import("expo-secure-store")).getItemAsync(preferenceKey);
    if ((value === "ar" || value === "en") && revision === startedAt) {
      preferred = true;
      locale = value;
      listeners.forEach((listener) => listener());
    }
  } catch {}
}
export function getAppLocale() {
  return locale;
}
export function useAppLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getAppLocale,
    getAppLocale,
  );
}
export function isRtl() {
  return locale === "ar";
}
/** Only authored UI copy calls this function. Record names and human messages stay untouched. */
export function copy(
  text: string,
  values: Record<string, string | number> = {},
): string {
  const translated =
    locale === "ar" ? ((ar as Record<string, string>)[text] ?? text) : text;
  return translated.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    String(values[key] ?? match),
  );
}
const legacy = {
  home: "Home",
  today: "Today",
  orders: "Orders",
  suppliers: "Suppliers",
  messages: "Messages",
  dispatch: "Dispatch",
  more: "More",
  needsAttention: "Needs attention",
  happeningToday: "Today",
  upNext: "Up next",
  recent: "Recent",
  noOpenOrders: "No open orders",
  loading: "Loading…",
  retry: "Try again",
  couldNotLoad: "Could not load data",
  welcomeBack: "Welcome back",
  signInSubtitle: "Sign in to your workspace to continue.",
  signIn: "Sign in",
  signingIn: "Signing in…",
  securedBySso: "Secure sign-in",
  tagline: "Your operation. In sync.",
  featureOrders: "Orders and purchasing",
  featureTracking: "Deliveries and receiving",
  featureFulfillment: "Stock and fulfillment",
} as const;
export function t(key: keyof typeof legacy) {
  return copy(legacy[key]);
}
