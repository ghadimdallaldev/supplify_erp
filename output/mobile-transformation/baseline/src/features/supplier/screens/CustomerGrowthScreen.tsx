import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSupplierGrowthMetrics, useSupplierProspects } from '../../../services/api/queries/growth'
import type { SupplierProspect } from '../../../types/growth'
import {
  Card,
  EmptyState,
  FlashList,
  Group,
  ListRow,
  LoadingState,
  Metric,
  Screen,
  SectionHeader,
  StatusPill,
} from '../../../components/ui'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import { formatMoney } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

export function CustomerGrowthScreen() {
  const metricsQuery = useSupplierGrowthMetrics()
  const prospectsQuery = useSupplierProspects()
  const metrics = metricsQuery.data
  const prospects = prospectsQuery.data?.prospects ?? []

  if (metricsQuery.isLoading && !metrics) return <LoadingState />

  return (
    <Screen title="Customer growth" subtitle="Prospects & referral metrics" scroll={false} padded={false}>
      <FlashList
        data={prospects}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={metricsQuery.isRefetching || prospectsQuery.isRefetching}
            onRefresh={() => {
              void metricsQuery.refetch()
              void prospectsQuery.refetch()
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {metricsQuery.isError ? (
              <Text style={styles.errorText}>Could not load metrics. Pull to refresh.</Text>
            ) : metrics ? (
              <>
                <View style={styles.statsRow}>
                  <Metric value={metrics.importedCustomers} label="Imported" />
                  <Metric value={metrics.existingSupplifyCustomers} label="On Supplify" />
                </View>
                <View style={styles.statsRow}>
                  <Metric value={metrics.invitedCustomers} label="Invited" />
                  <Metric value={metrics.convertedCustomers} label="Converted" />
                </View>
                <View style={styles.statsRow}>
                  <Metric value={metrics.sponsoredCustomers} label="Sponsored" />
                  <Metric value={metrics.registeredCustomers} label="Registered" />
                </View>
                <Metric
                  value={formatMoney(metrics.revenueGenerated)}
                  label="Revenue generated"
                  style={styles.fullStat}
                />
                {metrics.sponsorship && metrics.sponsorship.offersCreated > 0 ? (
                  <Card style={styles.funnelCard}>
                    <Text style={type.title}>Sponsorship funnel</Text>
                    <Text style={styles.funnelLine}>
                      {metrics.sponsorship.offersCreated} created · {metrics.sponsorship.offersAccepted}{' '}
                      accepted · {metrics.sponsorship.monthsActivated} activated
                    </Text>
                    {(metrics.sponsorship.paymentsPending > 0 ||
                      metrics.sponsorship.paymentsFailed > 0) && (
                      <Text style={styles.funnelWarn}>
                        {metrics.sponsorship.paymentsPending} payments pending ·{' '}
                        {metrics.sponsorship.paymentsFailed} failed
                      </Text>
                    )}
                  </Card>
                ) : null}
              </>
            ) : null}
            <SectionHeader style={styles.section}>Prospects</SectionHeader>
          </View>
        }
        ListEmptyComponent={
          prospectsQuery.isLoading ? (
            <LoadingState message="Loading prospects…" />
          ) : prospectsQuery.isError ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Could not load prospects"
              message="Pull to refresh or open on web."
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No prospects yet"
              message="Import customers on web to start tracking outreach."
            />
          )
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>Manage on web</SectionHeader>
            <Group>
              <OpenOnWebRow title="Import, invite & sponsor" path="/app/customer-growth" />
            </Group>
          </View>
        }
        renderItem={({ item }) => <ProspectRow prospect={item} />}
      />
    </Screen>
  )
}

function ProspectRow({ prospect }: { prospect: SupplierProspect }) {
  const contact = prospect.email || prospect.phone || prospect.contact_person
  const subtitleParts = [
    contact,
    prospect.area_region,
    prospect.matched_restaurant_name ? `Match: ${prospect.matched_restaurant_name}` : null,
  ].filter(Boolean) as string[]

  return (
    <ListRow
      avatarLabel={prospect.restaurant_name}
      title={prospect.restaurant_name}
      subtitle={subtitleParts.length ? subtitleParts.join(' · ') : undefined}
      showChevron={false}
      right={
        <View style={styles.pills}>
          <StatusPill status={prospect.lifecycle_status.replace(/_/g, ' ')} tone="info" />
          <StatusPill status={prospect.match_status.replace(/_/g, ' ')} tone="neutral" />
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  header: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.lg, flexWrap: 'wrap' },
  fullStat: { marginTop: 0 },
  funnelCard: { gap: 6 },
  funnelLine: { color: colors.textMuted, fontWeight: '500' },
  funnelWarn: { color: colors.warning, fontWeight: '600', fontSize: 13 },
  errorText: { color: colors.warning, fontWeight: '600' },
  section: { marginTop: theme.spacing.sm, marginBottom: 0 },
  pills: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  footer: { marginTop: theme.spacing.md },
})
