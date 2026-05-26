import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import {
  useCreateRestaurantMemberInvitationMutation,
  useGetRestaurantMemberInviteRolesQuery,
} from '../../services/api'

const ROLE_HELP: Record<string, string> = {
  Owner: 'Full access to everything',
  Manager: 'Operational control, can approve orders',
  Purchaser: 'Can place and track orders only',
  Accountant: 'Finance and invoices only',
  'Inventory Clerk': 'Manages stock and receiving',
  'FOH Staff': 'Reservations only',
  Viewer: 'Read-only',
}

type Props = {
  open: boolean
  onClose: () => void
}

export function RestaurantMemberInviteModal({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedRoleName, setSelectedRoleName] = useState('')

  const {
    data: rolesData,
    isLoading: rolesLoading,
    isError: rolesError,
    error: rolesQueryError,
  } = useGetRestaurantMemberInviteRolesQuery(undefined, { skip: !open })
  const [createInvitation, { isLoading }] = useCreateRestaurantMemberInvitationMutation()
  const roles = rolesData?.roles ?? []
  const rolesForbidden = rolesError && (rolesQueryError as { status?: number })?.status === 403

  useEffect(() => {
    if (!open) {
      setStep(1)
      setFullName('')
      setEmail('')
      setRoleId('')
      setInviteUrl(null)
      setCopied(false)
      setSelectedRoleName('')
    }
  }, [open])

  useEffect(() => {
    if (roles.length && !roleId) {
      const preferred = roles.find((r) => r.name === 'Manager') ?? roles[0]
      setRoleId(preferred.id)
      setSelectedRoleName(preferred.name)
    }
  }, [roles, roleId])

  const handleGenerate = async () => {
    if (!roleId) return
    const result = await createInvitation({
      invited_name: fullName.trim() || undefined,
      invited_email: email.trim() || undefined,
      role_id: roleId,
    }).unwrap()
    setInviteUrl(result.invite_url)
    setStep(2)
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const resetForAnother = () => {
    setFullName('')
    setEmail('')
    setInviteUrl(null)
    setStep(1)
    setCopied(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription>
                Choose a role, then share the invite link. System roles are set up automatically for
                your restaurant.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {rolesLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Loading roles…</p>
              ) : rolesForbidden ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  You don&apos;t have permission to invite team members. Ask an owner or manager, or
                  upgrade if team management is locked on your plan.
                </p>
              ) : roles.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No roles are configured yet. Save your restaurant profile and try again, or
                  contact support if this persists.
                </p>
              ) : null}
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Full name</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">
                  Email (for your reference — no email will be sent)
                </span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Role</span>
                <select
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={roleId}
                  onChange={(e) => {
                    const id = e.target.value
                    setRoleId(id)
                    const role = roles.find((r) => r.id === id)
                    setSelectedRoleName(role?.name ?? '')
                  }}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {selectedRoleName && ROLE_HELP[selectedRoleName] && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {ROLE_HELP[selectedRoleName]}
                  </p>
                )}
              </label>
              <Button
                type="button"
                className="w-full"
                disabled={isLoading || !roleId || roles.length === 0 || rolesLoading}
                onClick={() => handleGenerate().catch(() => {})}
              >
                Generate Invite Link
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share invite link</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border border-[var(--app-border)] p-3 space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Invite link (expires in 7 days)</p>
                <p className="text-sm break-all font-mono">{inviteUrl}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy().catch(() => {})}
                >
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
              <p className="text-xs text-[var(--text-muted)]">
                Anyone with this link can join as {selectedRoleName || 'your selected role'}.
                Expires in 7 days.
              </p>
              <div className="flex gap-2">
                <Button type="button" className="flex-1" onClick={onClose}>
                  Done
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={resetForAnother}
                >
                  Invite Another Person
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
