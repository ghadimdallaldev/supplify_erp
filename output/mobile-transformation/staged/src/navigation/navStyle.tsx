import React from "react";
import { useAdaptiveLayout } from "../theme/responsive";
import { useAppLocale, copy, isRtl } from "../i18n";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { colors, shadow, theme } from "../theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type IconPair = { on: IoniconName; off: IoniconName };

export function useTabScreenOptions(
  icons: Record<string, IconPair>,
): (props: { route: { name: string } }) => BottomTabNavigationOptions {
  const { wide, fontScale } = useAdaptiveLayout();
  const insets = useSafeAreaInsets();
  useAppLocale();
  return ({ route }) => ({
    tabBarPosition: wide ? (isRtl() ? "right" : "left") : "bottom",
    tabBarLabelPosition: wide ? "beside-icon" : "below-icon",
    tabBarLabel: copy(
      (
        {
          Shop: "Suppliers",
          Chat: "Messages",
          Dashboard: "Home",
          Fulfillment: "Dispatch",
          Deliveries: "Today",
        } as Record<string, string>
      )[route.name] ?? route.name,
    ),
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textFaint,
    // Reserve space for both the 54-point controls and the device's safe area.
    // The navigator's default height is shorter than these labeled controls.
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: theme.hairline,
      paddingTop: 6,
      ...(wide
        ? {
            width: 172,
            paddingTop: 24,
            borderEndWidth: 1,
            borderEndColor: colors.border,
          }
        : {}),
      ...(!wide
        ? { height: (fontScale >= 1.3 ? 78 : 68) + insets.bottom }
        : {}),
    },
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: "600" as const,
      marginBottom: 2,
    },
    tabBarItemStyle: {
      paddingTop: 2,
      minHeight: 54,
      ...(wide
        ? { marginHorizontal: 8, marginVertical: 4, borderRadius: 10 }
        : {}),
    },
    tabBarBadgeStyle: {
      backgroundColor: colors.danger,
      color: colors.onBrand,
      fontSize: 10,
      fontWeight: "700",
    },
    tabBarIcon: ({ focused, color, size }) => {
      const pair = icons[route.name];
      const name = pair ? (focused ? pair.on : pair.off) : "ellipse-outline";
      return <Ionicons name={name} size={(size ?? 23) + 1} color={color} />;
    },
  });
}

export const stackHeaderOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.brand,
  headerTitleStyle: { color: colors.text, fontWeight: "700", fontSize: 18 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
  headerBackVisible: true,
  animation: "default",
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: colors.background },
};
