import { StyleSheet, Text, View } from 'react-native'
import { useRestaurantInvoices } from '../../../services/api/queries'
import type { RestaurantInvoice } from '../../../types/finance'
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  StatusPill,
} from '../../../components/ui'
import { formatMoney, formatDay } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

export function InvoicesScreen() {
  const { data: invoices, isLoading } = useRestaurantInvoices()

  if (isLoading) return <LoadingState />

  const rows = invoices ?? []

  return (
    <Screen title="Invoices" subtitle={`${rows.length} invoice${rows.length === 1 ? '' : 's'}`} scroll={false} padded={false}>
      <FlashList
        data={rows}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState title="No invoices" message="Supplier invoices will appear here." icon="document-text-outline" />
        }
        renderItem={({ item }) => <InvoiceRow invoice={item} />}
      />
    </Screen>
  )
}

function InvoiceRow({ invoice }: { invoice: RestaurantInvoice }) {
  const currency = invoice.currency ?? 'USD'
  const amount = formatMoney(invoice.total_amount, currency)
  const balance = formatMoney(invoice.balance_due, currency)
  const date = formatDay(invoice.invoice_date)

  return (
    <Card style={styles.card}>
      <View style={styles.rowTop}>
        <Text style={type.title} numberOfLines={1}>
          {invoice.invoice_number ?? invoice.id.slice(0, 8)}
        </Text>
        {invoice.status ? <StatusPill status={invoice.status} domain="invoice" /> : null}
      </View>
      {invoice.supplier_name ? (
        <Text style={styles.meta} numberOfLines={1}>
          {invoice.supplier_name}
        </Text>
      ) : null}
      <View style={styles.rowBottom}>
        <Text style={styles.amount}>{amount}</Text>
        {date ? <Text style={styles.meta}>{date}</Text> : null}
      </View>
      {invoice.balance_due != null && Number(invoice.balance_due) > 0 ? (
        <Text style={styles.balance}>Balance due: {balance}</Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  card: { marginBottom: theme.spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  rowBottom: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
  meta: { ...type.label, marginTop: 4 },
  amount: { fontSize: 17, fontWeight: '800', color: colors.text },
  balance: { ...type.label, color: colors.warning, marginTop: 6 },
})
