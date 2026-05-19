import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import {
  useCreateBranchInvitationMutation,
  useGetBranchInviteRolesQuery,
} from '../../services/api'

type Props = {
  open: boolean
  supplierId: string
  branchName?: string
  onClose: () => void
}

export function BranchInviteModal({ open, supplierId, branchName, onClose }: Props) {
  const [managerName, setManagerName] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [createInvitation, { isLoading }] = useCreateBranchInvitationMutation()
  const { data: rolesData } = useGetBranchInviteRolesQuery(
    { supplier_id: supplierId },
    { skip: !open || !supplierId }
  )

  useEffect(() => {
    if (!open) {
      setManagerName('')
      setManagerEmail('')
      setRoleId('')
      setInviteUrl(null)
      setCopied(false)
    }
  }, [open])

  useEffect(() => {
    const roles = rolesData?.roles ?? []
    if (roles.length && !roleId) {
      const preferred = roles.find((r) => r.name === 'Manager') ?? roles[0]
      setRoleId(preferred.id)
    }
  }, [rolesData, roleId])

  const handleGenerate = async () => {
    const result = await createInvitation({
      supplier_id: supplierId,
      invited_name: managerName.trim() || undefined,
      invited_email: managerEmail.trim() || undefined,
      role_id: roleId,
    }).unwrap()
    setInviteUrl(result.invite_url)
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite someone to {branchName ?? 'this branch'}</DialogTitle>
        </DialogHeader>
        {!inviteUrl ? (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Name</span>
              <input
                className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">
                Email (for your reference — no email will be sent)
              </span>
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Role</span>
              <select
                className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {(rolesData?.roles ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={isLoading || !roleId}
              onClick={() => handleGenerate().catch(() => {})}
            >
              Generate Invite Link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--app-border)] p-3 space-y-2">
              <p className="text-xs text-[var(--text-muted)]">Invite link (expires in 7 days)</p>
              <p className="text-sm break-all font-mono">{inviteUrl}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => handleCopy().catch(() => {})}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" /> Copy Link
                  </>
                )}
              </Button>
            </div>
            <Button type="button" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
