import React from 'react'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs'
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import { colors, shadow, theme } from '../theme'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']
type IconPair = { on: IoniconName; off: IoniconName }

export function tabScreenOptions(
  icons: Record<string, IconPair>
): (props: { route: { name: string } }) => BottomTabNavigationOptions {
  return ({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textFaint,
    // No explicit height: bottom-tabs adds the bottom safe-area inset to its own
    // default, and hardcoding a height puts labels under the home indicator.
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: theme.hairline,
      paddingTop: 6,
      ...shadow.sheet,
    },
    tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' as const, marginBottom: 2 },
    tabBarItemStyle: { paddingTop: 2 },
    tabBarBadgeStyle: {
      backgroundColor: colors.danger,
      color: colors.onBrand,
      fontSize: 10,
      fontWeight: '700',
    },
    tabBarIcon: ({ focused, color, size }) => {
      const pair = icons[route.name]
      const name = pair ? (focused ? pair.on : pair.off) : 'ellipse-outline'
      return <Ionicons name={name} size={(size ?? 23) + 1} color={color} />
    },
  })
}

export const stackHeaderOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.brand,
  headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 18 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  headerBackVisible: true,
  contentStyle: { backgroundColor: colors.background },
}
