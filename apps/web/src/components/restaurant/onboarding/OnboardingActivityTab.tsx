import { usePermissions } from '../../../hooks/usePermissions'
import { ActivityLogTab } from '../../ActivityLogTab'

export function OnboardingActivityTab() {
  const { can } = usePermissions()

  return (
    <div className="space-y-4">
      <ActivityLogTab canExport={can('SETTINGS_MANAGE')} />
    </div>
  )
}
