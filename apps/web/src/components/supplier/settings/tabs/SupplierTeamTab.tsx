import { TeamRolesPanel } from '../../../TeamRolesPanel'
import { BranchInvitationsPanel } from '../../../org/BranchInvitationsPanel'
import { usePermissions } from '../../../../hooks/usePermissions'
import { useGetSupplierMeQuery } from '../../../../services/api'

export function SupplierTeamTab() {
  const { can } = usePermissions()
  const { data: supplierData } = useGetSupplierMeQuery()
  const supplier = supplierData?.supplier

  return (
    <div className="space-y-4">
      <TeamRolesPanel
        tenantType="SUPPLIER"
        renderInviteForm={
          can('STAFF_INVITE') && supplier?.id
            ? () => (
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  Use branch invitations below to invite staff with a role. Each person can only
                  belong to one supplier account.
                </p>
              )
            : undefined
        }
      />
      {can('STAFF_INVITE') && supplier?.id && (
        <BranchInvitationsPanel supplierId={supplier.id} branchName={supplier.name} />
      )}
    </div>
  )
}
