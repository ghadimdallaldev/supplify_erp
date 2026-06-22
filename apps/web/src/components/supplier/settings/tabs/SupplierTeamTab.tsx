import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TeamRolesPanel } from '../../../TeamRolesPanel'
import { BranchInvitationsPanel } from '../../../org/BranchInvitationsPanel'
import { usePermissions } from '../../../../hooks/usePermissions'
import { useGetSupplierMeQuery } from '../../../../services/api'
import { ensureNamespace } from '../../../../i18n'

export function SupplierTeamTab() {
  const { t } = useTranslation('suppliers')
  const { can } = usePermissions()
  const { data: supplierData } = useGetSupplierMeQuery()
  const supplier = supplierData?.supplier

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  return (
    <div className="space-y-4">
      <TeamRolesPanel
        tenantType="SUPPLIER"
        renderInviteForm={
          can('STAFF_INVITE') && supplier?.id
            ? () => <p className="text-sm text-[var(--text-muted)] mt-2">{t('team.inviteHint')}</p>
            : undefined
        }
      />
      {can('STAFF_INVITE') && supplier?.id && (
        <BranchInvitationsPanel supplierId={supplier.id} branchName={supplier.name} />
      )}
    </div>
  )
}
