import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BranchAccountsPanel } from '../../../BranchAccountsPanel'
import { ensureNamespace } from '../../../../i18n'

export function SupplierBranchesTab() {
  const { t } = useTranslation('suppliers')

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  return (
    <div className="space-y-4">
      <BranchAccountsPanel entityLabel={t('branches.entityLabel')} />
    </div>
  )
}
