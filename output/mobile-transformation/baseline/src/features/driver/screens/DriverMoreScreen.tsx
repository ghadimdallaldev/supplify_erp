import { StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../../auth/AuthContext'
import { Button, Group, ListRow, Screen, SectionHeader } from '../../../components/ui'
import { colors, theme, type } from '../../../theme'

export function DriverMoreScreen() {
  const { user, logout } = useAuth()
  const navigation = useNavigation()

  const displayName = user?.displayName ?? user?.email ?? 'Driver'
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('')

  const navigate = (screen: string) => navigation.navigate(screen as never)

  return (
    <Screen title="More" scroll padded={false}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={type.h2} numberOfLines={1}>
            {displayName}
          </Text>
          {user?.workspace?.tenantName ? (
            <Text style={type.label} numberOfLines={1}>
              {user.workspace.tenantName}
            </Text>
          ) : null}
          {user?.workspace?.roleName ? <Text style={type.caption}>{user.workspace.roleName}</Text> : null}
        </View>
      </View>

      <SectionHeader>Today</SectionHeader>
      <Group>
        <ListRow compact title="Run sheet" onPress={() => navigate('DriverRunSheet')} />
        <ListRow compact title="Notifications" onPress={() => navigate('Notifications')} />
        <ListRow compact title="Notification settings" onPress={() => navigate('NotificationPreferences')} />
      </Group>

      <View style={styles.signOut}>
        <Button
          label="Delete account"
          variant="danger"
          icon="trash-outline"
          onPress={() => navigate('DeleteAccount')}
        />
        <Button label="Sign out" variant="outline" icon="log-out-outline" onPress={() => void logout()} />
        <Text style={styles.version}>Supplify Mobile · v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.neutralBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.textMuted, fontSize: 17, fontWeight: '700' },
  signOut: { padding: theme.gutter, gap: theme.spacing.md },
  version: { textAlign: 'center', color: colors.textFaint, fontSize: 12, fontWeight: '500' },
})
