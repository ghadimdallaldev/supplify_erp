import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '../ui/button'
import {
  useGetBranchInvitationsQuery,
  useRevokeBranchInvitationMutation,
  useRegenerateBranchInvitationMutation,
} from '../../services/api'
import { BranchInviteModal } from './BranchInviteModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

type Props = {
  supplierId: string
  branchName: string
}

export function BranchInvitationsPanel({ supplierId, branchName }: Props) {
  const { data, isLoading } = useGetBranchInvitationsQuery({ supplier_id: supplierId })
  const [revoke] = useRevokeBranchInvitationMutation()
  const [regenerate] = useRegenerateBranchInvitationMutation()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copyUrl, setCopyUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invitations = data?.invitations ?? []

  const handleCopyLink = async (id: string) => {
    const result = await regenerate(id).unwrap()
    setCopyUrl(result.invite_url)
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!copyUrl) return
    await navigator.clipboard.writeText(copyUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Invitations</h2>
        <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
          Invite Someone New
        </Button>
      </div>

      {isLoading && <p className="text-sm text-[var(--text-muted)]">Loading invitations…</p>}

      <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-muted)] text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-t border-[var(--app-border)]">
                <td className="px-3 py-2">{inv.invited_name || '—'}</td>
                <td className="px-3 py-2">{inv.invited_email || '—'}</td>
                <td className="px-3 py-2">{inv.role_name}</td>
                <td className="px-3 py-2 capitalize">{inv.status}</td>
                <td className="px-3 py-2">
                  {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2">
                  {inv.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[var(--brand)] hover:underline"
                        onClick={() => handleCopyLink(inv.id).catch(() => {})}
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => revoke(inv.id).catch(() => {})}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                  {inv.status === 'accepted' && (
                    <span className="text-[var(--text-muted)]">
                      {inv.accepted_by_name || 'Accepted'}
                    </span>
                  )}
                  {(inv.status === 'expired' || inv.status === 'revoked') && (
                    <button
                      type="button"
                      className="text-[var(--brand)] hover:underline"
                      onClick={() => handleCopyLink(inv.id).catch(() => {})}
                    >
                      Resend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && invitations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">
                  No invitations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BranchInviteModal
        open={inviteOpen}
        supplierId={supplierId}
        branchName={branchName}
        onClose={() => setInviteOpen(false)}
      />

      <Dialog open={Boolean(copyUrl)} onOpenChange={(open) => !open && setCopyUrl(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Invitation link</DialogTitle>
          </DialogHeader>
          <p className="text-sm break-all font-mono">{copyUrl}</p>
          <Button type="button" variant="outline" onClick={() => handleCopy().catch(() => {})}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1 inline" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1 inline" /> Copy Link
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
