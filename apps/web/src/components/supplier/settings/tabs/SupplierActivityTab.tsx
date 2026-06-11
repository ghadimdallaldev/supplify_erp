import { ActivityLogTab } from '../../../ActivityLogTab'
import { usePermissions } from '../../../../hooks/usePermissions'

export function SupplierActivityTab() {
  const { can } = usePermissions()

  return (
    <div className="space-y-4">
      <ActivityLogTab canExport={can('SETTINGS_MANAGE')} />
    </div>
  )
}
