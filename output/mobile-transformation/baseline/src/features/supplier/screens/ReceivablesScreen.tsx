import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useSupplierReceivables } from '../../../services/api/queries'
import { Card, EmptyState, LoadingState, Screen, StatCard } from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import type { RestaurantInvoice } from '../../../types/finance'
import { colors, theme, type } from '../../../theme'

export function ReceivablesScreen() {
  const { data, isLoading, isError } = useSupplierReceivables()

  if (isLoading) return <LoadingState />

  const summary = data?.summary
  const invoices = data?.invoices ?? []

  return (
    <Screen title="Receivables" subtitle="Outstanding invoices" padded={false}>
      {isError ? (
        <View style={styles.pad}>
          <Card>
            <Text style={styles.error}>Could not load receivables.</Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.statsRow}>
                <StatCard
                  value={formatMoney(summary?.totalBalanceDue ?? 0)}
                  label="Total due"
                  icon="cash-outline"
                  tone="warning"
                />
                <StatCard
                  value={summary?.overdueCount ?? 0}
                  label="Overdue"
                  icon="alert-circle-outline"
                  tone="danger"
                />
              </View>
              <StatCard
                value={summary?.count ?? invoices.length}
                label="Open invoices"
                icon="document-text-outline"
                tone="info"
                style={styles.fullStat}
              />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              title="All caught up"
              message="No outstanding receivables right now."
            />
          }
          renderItem={({ item }) => <InvoiceRow invoice={item} />}
        />
      )}
    </Screen>
  )
}

function InvoiceRow({ invoice }: { invoice: RestaurantInvoice }) {
  const balance = invoice.balance_due ?? invoice.total_amount
  const isOverdue = invoice.status === 'OVERDUE'

  return (
    <Card style={styles.invoiceCard}>
      <View style={styles.rowTop}>
        <Text style={styles.title} numberOfLines={1}>
          {invoice.invoice_number ?? `Invoice ${invoice.id.slice(0, 8)}`}
        </Text>
        {isOverdue ? (
          <View style={styles.overdueBadge}>
            <Text style={styles.overdueText}>Overdue</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowBottom}>
        <Text style={styles.balance}>{formatMoney(balance, invoice.currency)}</Text>
        {invoice.due_date ? <Text style={styles.due}>Due {invoice.due_date}</Text> : null}
      </View>
      {invoice.status ? <Text style={styles.status}>{invoice.status.replace(/_/g, ' ')}</Text> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  pad: { padding: theme.spacing.md },
  list: { padding: theme.spacing.md, paddingTop: 0, paddingBottom: theme.spacing.xxl },
  header: { marginBottom: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  fullStat: { marginBottom: theme.spacing.md },
  error: { color: colors.danger, fontWeight: '600' },
  invoiceCard: { marginBottom: theme.spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  title: { ...type.title, flex: 1 },
  meta: { ...type.label, marginTop: 4 },
  rowBottom: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: theme.spacing.sm },
  balance: { fontSize: 18, fontWeight: '800', color: colors.text },
  due: { ...type.label },
  status: { ...type.caption, marginTop: 4, textTransform: 'capitalize' },
  overdueBadge: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  overdueText: { fontSize: 11, fontWeight: '700', color: colors.danger },
})
