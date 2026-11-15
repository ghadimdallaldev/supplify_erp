import { useAppLocale as useUiLocale } from "../i18n";
import React, { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { usePushRegistration } from "../features/push/usePushRegistration";
import { ToastProvider } from "../features/shared/ToastProvider";
import { OfflineBanner } from "../features/shared/OfflineBanner";
import { ApiError } from "../services/api/client";
import { configurePushPresentation, isPushAvailable } from "../services/push";
import {
  connectChatSocket,
  disconnectChatSocket,
  getChatSocket,
} from "../services/chatSocket";
import { queryKeys } from "../services/api/queries/keys";
import {
  flushPendingNotificationTarget,
  navigationRef,
  openNotificationTarget,
  resolveNotificationTarget,
} from "../navigation/notificationNavigation";
import { colors } from "../theme";
import { RootNavigator } from "../navigation/RootNavigator";
import { setAppLocale } from "../i18n";
import { getRequestScopeVersion } from "../features/auth/requestScope";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        )
          return false;
        return failureCount < 2;
      },
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

function RuntimeEffects() {
  const { user } = useAuth();
  usePushRegistration();

  useEffect(() => {
    if (user?.locale === "ar" || user?.locale === "en")
      setAppLocale(user.locale, { persist: false });
  }, [user?.locale]);

  useEffect(() => {
    void configurePushPresentation();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!user) {
      disconnectChatSocket();
      return;
    }

    const socket = getChatSocket();
    const refreshNotifications = (payload?: { notification_type?: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      if (payload?.notification_type === "MESSAGE") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chatConversations,
        });
      }
    };

    socket.on("notification_new", refreshNotifications);
    void connectChatSocket().catch(() => {});

    return () => {
      socket.off("notification_new", refreshNotifications);
      disconnectChatSocket();
    };
  }, [user?.id, user?.workspace?.tenantId]);

  useEffect(() => {
    if (!user || !isPushAvailable()) return;
    let active = true;
    const scope = getRequestScopeVersion();
    let responseSubscription: { remove: () => void } | undefined;
    let receivedSubscription: { remove: () => void } | undefined;

    const openResponse = (response: {
      notification: {
        request: { content: { data?: Record<string, unknown> } };
      };
    }) => {
      if (!active || scope !== getRequestScopeVersion()) return;
      const data = response.notification.request.content.data ?? {};
      openNotificationTarget(
        resolveNotificationTarget(user, { ...data, metadata: data }),
      );
    };

    void import("expo-notifications").then((Notifications) => {
      if (!active) return;
      const handleResponse = (response: Parameters<typeof openResponse>[0]) => {
        openResponse(response);
        Notifications.clearLastNotificationResponse();
      };
      const last = Notifications.getLastNotificationResponse();
      if (last && active) handleResponse(last);
      responseSubscription =
        Notifications.addNotificationResponseReceivedListener(handleResponse);
      receivedSubscription = Notifications.addNotificationReceivedListener(
        (notification) => {
          if (!active || scope !== getRequestScopeVersion()) return;
          void queryClient.invalidateQueries({
            queryKey: queryKeys.notifications,
          });
          const data = notification.request.content.data ?? {};
          const notificationType =
            data.notification_type ?? data.notificationType;
          const referenceType = data.reference_type ?? data.referenceType;
          const notificationCategory =
            data.notification_category ?? data.notificationCategory;
          if (
            notificationType === "MESSAGE" ||
            referenceType === "CONVERSATION"
          ) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.chatConversations,
            });
          }
          if (notificationCategory === "FULFILLMENT_TRANSFER") {
            void queryClient.invalidateQueries({ queryKey: ["orders"] });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.dispatch,
            });
            void queryClient.invalidateQueries({
              queryKey: ["supplier", "deliveries"],
            });
          }
        },
      );
    });

    return () => {
      active = false;
      responseSubscription?.remove();
      receivedSubscription?.remove();
    };
  }, [user]);

  return null;
}

export function AppProviders() {
  useUiLocale();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RuntimeEffects />
          <ToastProvider>
            <OfflineBanner />
            <NavigationContainer
              theme={{
                ...DefaultTheme,
                colors: {
                  ...DefaultTheme.colors,
                  primary: colors.brand,
                  background: colors.background,
                  card: colors.surface,
                  text: colors.text,
                  border: colors.border,
                  notification: colors.danger,
                },
              }}
              ref={navigationRef}
              onReady={flushPendingNotificationTarget}
              linking={{
                prefixes: ["supplify://", "https://app.supplifyerp.com"],
                config: {
                  screens: {
                    Storefront: "supplier/:idOrSlug",
                    Receipt: "order/track/:token",
                  },
                },
              }}
            >
              <RootNavigator />
            </NavigationContainer>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
