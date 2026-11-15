import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSupplierStatement, useSuppliers } from '../../../services/api/queries'
import {
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
} from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: isoDate(start), end: isoDate(end) }
}

const RANGE_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This year', days: -1 },
] as const

export function InvoiceStatementScreen() {
  const defaults = useMemo(() => defaultRange(), [])
  const [supplierId, setSupplierId] = useState('')
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)

  const { data: suppliersData, isLoading: suppliersLoading } = useSuppliers()
  const suppliers = suppliersData?.suppliers ?? []
  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  const { data: statement, isLoading: statementLoading } = useSupplierStatement(
    supplierId,
    startDate,
    endDate
  )

  const applyPreset = (days: number) => {
    const end = new Date()
    const start = new Date()
    if (days < 0) {
      start.setMonth(0, 1)
    } else {
      start.setDate(start.getDate() - days)
    }
    setStartDate(isoDate(start))
    setEndDate(isoDate(end))
  }

  if (suppliersLoading) return <LoadingState />

  const summary = statement?.summary
  const currency = 'USD'

  return (
    <Screen title="Statement" subtitle="Supplier account summary" scroll>
      <SectionHeader>Supplier</SectionHeader>
      <View style={styles.chips}>
        {suppliers.map((s) => {
          const active = s.id === supplierId
          return (
            <Pressable
              key={s.id}
              onPress={() => setSupplierId(s.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {suppliers.length === 0 ? (
        <EmptyState title="No suppliers" message="Connect with suppliers to view statements." />
      ) : null}

      <SectionHeader>Date range</SectionHeader>
      <View style={styles.presets}>
        {RANGE_PRESETS.map((p) => (
          <Pressable key={p.label} onPress={() => applyPreset(p.days)} style={styles.preset}>
            <Text style={styles.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.rangeLabel}>
        {startDate} → {endDate}
      </Text>

      {!supplierId ? (
        <EmptyState title="Select a supplier" message="Choose a supplier above to load the statement." />
      ) : statementLoading ? (
        <LoadingState message="Loading statement…" />
      ) : summary ? (
        <>
          <View style={styles.statsRow}>
            <StatCard
              value={formatMoney(summary.openingBalance, currency)}
              label="Opening balance"
              icon="wallet-outline"
              tone="neutral"
            />
            <StatCard
              value={formatMoney(summary.totalAdjustments, currency)}
              label="Adjustments"
              icon="swap-horizontal-outline"
              tone="warning"
            />
          </View>
          <StatCard
            value={formatMoney(summary.closingBalance, currency)}
            label="Closing balance"
            icon="cash-outline"
            tone="success"
            style={styles.closingStat}
          />
          {selectedSupplier ? (
            <Text style={styles.supplierMeta}>Statement for {selectedSupplier.name}</Text>
          ) : null}
          {(statement?.invoices ?? []).length > 0 ? (
            <>
              <SectionHeader>Invoices in period</SectionHeader>
              {statement!.invoices.map((inv) => (
                <Card key={inv.id} style={styles.invCard}>
                  <Text style={type.title}>{inv.invoice_number ?? inv.id.slice(0, 8)}</Text>
                  <Text style={styles.invMeta}>
                    {formatMoney(inv.total_amount, inv.currency ?? currency)}
                    {inv.invoice_date ? ` · ${inv.invoice_date}` : ''}
                  </Text>
                </Card>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <EmptyState title="No statement data" message="Try a different date range." />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '48%',
  },
  chipActive: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.text },
  chipTextActive: { color: colors.brandDark },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: { ...type.caption, color: colors.textMuted },
  rangeLabel: { ...type.label, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  closingStat: { marginBottom: theme.spacing.sm },
  supplierMeta: { ...type.label, textAlign: 'center', marginBottom: theme.spacing.md },
  invCard: { marginBottom: theme.spacing.xs },
  invMeta: { ...type.label, marginTop: 4 },
})
