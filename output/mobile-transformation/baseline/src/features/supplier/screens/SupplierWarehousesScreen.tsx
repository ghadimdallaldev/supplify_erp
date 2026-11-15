import { RefreshControl, StyleSheet, View } from 'react-native'
import { useSupplierWarehouses } from '../../../services/api/queries/warehouses'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  formatWarehouseAddress,
  warehouseStatusLabel,
  type SupplierWarehouse,
} from '../../../types/supplierSettings'
import { EmptyState, FlashList, Group, LoadingState, OperationalRow, Screen, SectionHeader } from '../../../components/ui'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import { theme } from '../../../theme'

export function SupplierWarehousesScreen() {
  const { canAny } = usePermissions()
  const canManageOnWeb = canAny('WAREHOUSES_EDIT', 'WAREHOUSES_MANAGE')
  const query = useSupplierWarehouses()
  const warehouses = query.data?.warehouses ?? []

  if (query.isLoading) return <LoadingState />

  return (
    <Screen
      title="Warehouses"
      subtitle={`${warehouses.length} location${warehouses.length === 1 ? '' : 's'}`}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={warehouses}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListHeaderComponent={<SectionHeader style={styles.section}>Locations</SectionHeader>}
        ListEmptyComponent={
          <EmptyState
            icon="business-outline"
            title="No warehouses yet"
            message={
              canManageOnWeb
                ? 'Add your first warehouse on web, then refresh here.'
                : 'Warehouses configured on web will appear here.'
            }
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>Manage on web</SectionHeader>
            <Group>
              <OpenOnWebRow title="Add or edit warehouses" path="/app/supplier-settings?tab=warehouses" />
              <OpenOnWebRow title="Zones & rules on web" path="/app/supplier-settings?tab=delivery" />
            </Group>
          </View>
        }
        renderItem={({ item }) => <WarehouseRow warehouse={item} />}
      />
    </Screen>
  )
}

function WarehouseRow({ warehouse }: { warehouse: SupplierWarehouse }) {
  const address = formatWarehouseAddress(warehouse.address)
  const isDefault = warehouse.is_default || warehouse.is_main
  const title = isDefault ? `${warehouse.name} · Default` : warehouse.name
  const subtitleParts = [address || 'No address', warehouse.code || null].filter(Boolean) as string[]

  return (
    <OperationalRow
      avatarLabel={warehouse.name}
      title={title}
      subtitle={subtitleParts.join(' · ')}
      status={warehouseStatusLabel(warehouse)}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  section: { marginTop: theme.spacing.sm, marginBottom: 0 },
  footer: { marginTop: theme.spacing.md },
})
