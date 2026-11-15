import { Linking, StyleSheet, Text, View } from 'react-native'
import { useMyFeaturedPlacements } from '../../../services/api/queries'
import { Card, EmptyState, LoadingState, Screen, Button } from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import type { FeaturedPlacement } from '../../../types/featuredPlacement'
import { colors, theme } from '../../../theme'
import { webAppUrl } from '../../../utils/webAppUrl'

/**
 * Store readiness (2C): digital SaaS / featured-placement purchase UI is web-only.
 * Mobile shows status and a handoff link — no card entry or purchase mutations.
 */
export function FeaturedPlacementScreen() {
  const mineQuery = useMyFeaturedPlacements()

  if (mineQuery.isLoading) {
    return (
      <Screen title="Featured placement">
        <LoadingState message="Loading placements…" />
      </Screen>
    )
  }

  const placements = (mineQuery.data || []) as FeaturedPlacement[]

  return (
    <Screen title="Featured placement" scroll>
      <View style={styles.body}>
        <Card>
          <Text style={styles.title}>Manage on the web</Text>
          <Text style={styles.copy}>
            Purchasing featured placement and entering payment details is available on the Supplify
            web app. This mobile screen shows your existing placements only.
          </Text>
          <Button
            label="Open web billing"
            onPress={() => void Linking.openURL(webAppUrl('/app/settings'))}
          />
        </Card>

        {placements.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="No placements yet"
            message="Buy and manage featured placement packages on the web."
          />
        ) : (
          placements.map((item) => (
            <Card key={item.id}>
              <Text style={styles.rowTitle}>{item.pricing_key || 'Featured placement'}</Text>
              <Text style={styles.meta}>Status: {item.status}</Text>
              {item.amount_paid != null ? (
                <Text style={styles.meta}>{formatMoney(Number(item.amount_paid))}</Text>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { padding: theme.gutter, gap: theme.spacing.md },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: theme.spacing.md },
  rowTitle: { fontWeight: '700', color: colors.text },
  meta: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
})
