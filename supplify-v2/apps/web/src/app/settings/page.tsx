import { AuthGuard } from '@/components/auth-guard'
import { UserSettings } from '@/components/user-settings'

export default function SettingsPage() {
  return (
    <AuthGuard>
      <UserSettings />
    </AuthGuard>
  )
}
