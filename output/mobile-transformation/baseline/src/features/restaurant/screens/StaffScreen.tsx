import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useStaffMembers } from '../../../services/api/queries'
import type { StaffMember } from '../../../types/staff'
import { staffDisplayName, staffStatusLabel } from '../../../types/staff'
import { usePermissions } from '../../../hooks/usePermissions'
import { Card, EmptyState, FlashList, LoadingState, Screen, SectionHeader, StatusPill } from '../../../components/ui'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import { colors, theme, type } from '../../../theme'

export function StaffScreen() {
  const { canAny } = usePermissions()
  const canManageOnWeb = canAny('STAFF_EDIT', 'STAFF_MANAGE', 'STAFF_INVITE')
  const query = useStaffMembers()
  const members = query.data ?? []

  if (query.isLoading) return <LoadingState />

  return (
    <Screen
      title="Staff"
      subtitle={`${members.length} team member${members.length === 1 ? '' : 's'}`}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={members}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListHeaderComponent={<SectionHeader style={styles.section}>Team roster</SectionHeader>}
        ListEmptyComponent={
          <EmptyState
            title="No staff yet"
            message="Team members added on web will appear here."
            icon="people-outline"
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>Manage on web</SectionHeader>
            <View style={styles.footerGroup}>
              <OpenOnWebRow title="Schedule on web" path="/app/staff" />
              {canManageOnWeb ? (
                <OpenOnWebRow title="Invites & payroll on web" path="/app/staff" />
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => <StaffMemberRow member={item} />}
      />
    </Screen>
  )
}

function StaffMemberRow({ member }: { member: StaffMember }) {
  const name = staffDisplayName(member)
  const initial = name.charAt(0).toUpperCase() || '?'
  const accent = member.profileColor || colors.brand

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: accent }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={[type.title, styles.name]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {member.role || 'Team member'}
          </Text>
        </View>
        <StatusPill status={staffStatusLabel(member.status)} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  card: { marginBottom: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onBrand, fontWeight: '800', fontSize: 16 },
  meta: { flex: 1, minWidth: 0 },
  name: { marginBottom: 2 },
  role: { color: colors.textMuted, fontWeight: '500' },
  footer: { marginTop: theme.spacing.md },
  footerGroup: { gap: theme.spacing.sm },
})
