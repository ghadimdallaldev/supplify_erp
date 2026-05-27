import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '../ui/button'
import {
  useGetRestaurantMemberInvitationsQuery,
  useRegenerateRestaurantMemberInvitationMutation,
  useRevokeRestaurantMemberInvitationMutation,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'

export function RestaurantPendingInvitations() {
  const { canAny } = usePermissions()
  const canManageInvites = canAny('STAFF_MANAGE', 'STAFF_INVITE', 'SETTINGS_MANAGE')
  const { data, refetch } = useGetRestaurantMemberInvitationsQuery(undefined, {
    skip: !canManageInvites,
  })
  const [revoke] = useRevokeRestaurantMemberInvitationMutation()
  const [regenerate] = useRegenerateRestaurantMemberInvitationMutation()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (!canManageInvites) return null

  const invitations = (data?.invitations ?? []).filter((inv) =>
    ['pending', 'expired', 'revoked'].includes(inv.status)
  )
  if (!invitations.length) return null

  const handleCopy = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="text-sm font-semibold">Pending invitations</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Expires</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-b border-[var(--app-border)]">
                <td className="py-2 pr-3">{inv.invited_name || '—'}</td>
                <td className="py-2 pr-3">{inv.invited_email || '—'}</td>
                <td className="py-2 pr-3">{inv.role_name}</td>
                <td className="py-2 pr-3 capitalize">{inv.status}</td>
                <td className="py-2 pr-3">{new Date(inv.expires_at).toLocaleDateString()}</td>
                <td className="py-2">
                  {inv.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const result = await regenerate(inv.id).unwrap()
                          await handleCopy(result.invite_url, inv.id)
                          refetch()
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        {copiedId === inv.id ? 'Copied!' : 'Copy Link'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await revoke(inv.id).unwrap()
                          refetch()
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                  {(inv.status === 'expired' || inv.status === 'revoked') && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await regenerate(inv.id).unwrap()
                        refetch()
                      }}
                    >
                      Resend
                    </Button>
                  )}
                  {inv.status === 'accepted' && (
                    <span className="text-[var(--text-muted)]">
                      {inv.accepted_by_name || 'Accepted'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
