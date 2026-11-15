import { useState } from 'react'
import { Alert, Linking, View, StyleSheet, Switch, Text, TextInput, Pressable } from 'react-native'
import { useAuth } from '../features/auth/AuthContext'
import { Button, EmptyState, Screen } from '../components/ui'
import { LegalLinks } from '../components/LegalLinks'
import { theme, colors } from '../theme'
import { api } from '../services/api/client'
import { webAppUrl } from '../utils/webAppUrl'

export function PendingScreen() {
  const { user, logout, refreshUser, isLoading } = useAuth()
  const [name, setName] = useState(user?.displayName || '')
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const completeConsumer = async () => {
    if (!name.trim() || !accepted) {
      Alert.alert('Required', 'Enter your name and accept the Terms and Privacy Policy.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/api/register/complete', {
        accountType: 'CONSUMER',
        name: name.trim(),
        phone: phone.trim() || undefined,
        legalAcceptance: {
          packVersion: '2026-09-12',
          acceptedDocuments: ['terms_and_conditions', 'privacy_policy'],
          electronicSignatureAttestation: true,
        },
      })
      await refreshUser()
    } catch (error) {
      Alert.alert('Could not complete registration', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen title="Supplify">
      <View style={styles.body}>
        <EmptyState
          icon="hourglass-outline"
          title="Complete registration"
          message={
            __DEV__
              ? 'New accounts stay pending until setup on the web. For local dev use admin@supplify.com / SupplifyAdmin1! — or tap Try again after an admin promotes your account.'
              : 'Finish setting up your account on the web, then sign in again here.'
          }
        />
        <View style={styles.form}>
          <Text style={styles.heading}>Personal shopper account</Text>
          <TextInput placeholder="Full name" value={name} onChangeText={setName} style={styles.input} />
          <TextInput placeholder="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
          <View style={styles.accept}>
            <Text style={styles.acceptText}>
              I accept the Supplify{' '}
              <Text
                style={styles.link}
                onPress={() => void Linking.openURL(webAppUrl('/legal/terms_and_conditions'))}
              >
                Terms
              </Text>{' '}
              and{' '}
              <Text
                style={styles.link}
                onPress={() => void Linking.openURL(webAppUrl('/legal/privacy_policy'))}
              >
                Privacy Policy
              </Text>
              .
            </Text>
            <Switch value={accepted} onValueChange={setAccepted} />
          </View>
          <Button label="Complete personal account" loading={submitting} onPress={() => void completeConsumer()} />
          <LegalLinks compact />
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Try again" loading={isLoading} onPress={() => void refreshUser()} />
        <Button label="Sign out" variant="outline" onPress={() => void logout()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: theme.gutter, gap: theme.spacing.md },
  form: { gap: theme.spacing.sm },
  heading: { fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  accept: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  acceptText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  link: { color: colors.brand, textDecorationLine: 'underline', fontWeight: '600' },
  actions: { padding: theme.gutter, gap: theme.spacing.sm },
})
