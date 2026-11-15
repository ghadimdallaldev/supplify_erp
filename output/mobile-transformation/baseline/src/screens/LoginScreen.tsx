import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../features/auth/AuthContext'
import type { AuthStackParamList } from '../navigation/AuthNavigator'
import { Button } from '../components/ui'
import { LegalLinks } from '../components/LegalLinks'
import { useMobilePublicShopEnabled } from '../features/publicShop/useMobilePublicShopEnabled'
import { colors, theme, type } from '../theme'
import { t } from '../i18n'

const FEATURES: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  labelKey: 'featureOrders' | 'featureTracking' | 'featureFulfillment'
}[] = [
  { icon: 'receipt-outline', labelKey: 'featureOrders' },
  { icon: 'navigate-outline', labelKey: 'featureTracking' },
  { icon: 'cube-outline', labelKey: 'featureFulfillment' },
]

export function LoginScreen() {
  const { login, register, isLoading } = useAuth()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const { enabled: publicShopEnabled, isLoading: flagLoading } = useMobilePublicShopEnabled()

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.brandDeep, colors.brand, colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + theme.spacing.xxl }]}
      >
        <View style={styles.logoBadge}>
          <Ionicons name="cube" size={28} color={colors.onBrand} />
        </View>
        <Text style={styles.logo} accessibilityRole="header">
          Supplify
        </Text>
        <Text style={styles.tagline}>{t('tagline')}</Text>
      </LinearGradient>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <Text style={styles.welcome}>{t('welcomeBack')}</Text>
        <Text style={styles.sub}>{t('signInSubtitle')}</Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.labelKey} style={styles.feature}>
              <Ionicons name={f.icon} size={18} color={colors.brand} />
              <Text style={styles.featureText}>{t(f.labelKey)}</Text>
            </View>
          ))}
        </View>

        <Button
          label={isLoading ? t('signingIn') : t('signIn')}
          icon={isLoading ? undefined : 'log-in-outline'}
          loading={isLoading}
          onPress={() => void login()}
        />
        {!flagLoading && publicShopEnabled ? (
          <>
            <Button
              label="Create shopper account"
              variant="outline"
              disabled={isLoading}
              onPress={() => void register()}
              style={{ marginTop: theme.spacing.sm }}
            />
            <Button
              label="Browse as guest"
              variant="ghost"
              disabled={isLoading}
              onPress={() => navigation.navigate('GuestShop')}
              style={{ marginTop: theme.spacing.xs }}
            />
          </>
        ) : null}
        <Text style={styles.legal}>{t('securedBySso')}</Text>
        <LegalLinks compact />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: theme.gutter,
    paddingBottom: theme.spacing.xxl,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  logo: { fontSize: 40, fontWeight: '700', color: colors.onBrand, letterSpacing: -0.8 },
  tagline: {
    ...type.body,
    fontSize: 15,
    color: colors.onBrandMuted,
    marginTop: theme.spacing.xs,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.xl,
    marginTop: -20,
  },
  welcome: { ...type.h1, fontSize: 24 },
  sub: { ...type.label, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xl },
  features: { gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  feature: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  featureText: { ...type.body, fontWeight: '500', flex: 1 },
  legal: { ...type.caption, textAlign: 'center', marginTop: theme.spacing.md },
})
