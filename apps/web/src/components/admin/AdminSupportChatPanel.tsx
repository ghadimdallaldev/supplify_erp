import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useGetAdminSupportConversationsQuery } from '../../services/api'
import { AppPanel } from '../ui/app-panel'
import { Skeleton } from '../ui/skeleton'

export function AdminSupportChatPanel() {
  const { t } = useTranslation('admin')
  const { data, isLoading } = useGetAdminSupportConversationsQuery()

  const conversations = data?.conversations ?? []

  return (
    <AppPanel title={t('supportChat.title')} testId="admin-support-chat-panel">
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : conversations.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No support conversations yet</p>
      ) : (
        <ul className="divide-y divide-[var(--app-border)]">
          {conversations.map((c: any) => (
            <li key={c.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.tenant_name || 'Tenant'}</p>
                <p className="text-xs text-[var(--text-muted)]">{c.support_tenant_type}</p>
              </div>
              <Link
                to={`/app/chat?conversation=${c.id}&support=1`}
                className="text-sm text-[var(--brand)] underline shrink-0"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppPanel>
  )
}
