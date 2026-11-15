import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { webAppUrl } from '../utils/webAppUrl'
import { colors, theme } from '../theme'

const LINKS = [
  { label: 'Privacy Policy', path: '/legal/privacy_policy' },
  { label: 'Terms', path: '/legal/terms_and_conditions' },
  { label: 'Mobile App Terms', path: '/legal/mobile_app_terms' },
  { label: 'Delete account (web)', path: '/account/delete' },
] as const

export function LegalLinks({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {LINKS.map((link) => (
        <Pressable
          key={link.path}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(webAppUrl(link.path))}
          style={styles.row}
        >
          <Text style={styles.link}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  compact: { paddingVertical: 0 },
  row: { paddingVertical: 4 },
  link: { color: colors.brand, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
})
