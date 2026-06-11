import { Link } from 'react-router-dom'
import { useGetAdminSupportConversationsQuery } from '../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { MessageCircle } from 'lucide-react'

export function AdminSupportChatPanel() {
  const { data, isLoading } = useGetAdminSupportConversationsQuery()

  const conversations = data?.conversations ?? []

  return (
    <Card data-testid="admin-support-chat-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          Support conversations
        </CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
