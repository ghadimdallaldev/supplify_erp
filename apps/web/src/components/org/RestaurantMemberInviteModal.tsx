import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Select, SelectTrigger } from '../ui/select'
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
  const [selectedRoleName, setSelectedRoleName] = useState('')

  const {
    data: rolesData,
    isLoading: rolesLoading,
    isError: rolesError,
    error: rolesQueryError,
  } = useGetRestaurantMemberInviteRolesQuery(undefined, { skip: !open })
  const [createInvitation, { isLoading }] = useCreateRestaurantMemberInvitationMutation()
  const roles = useMemo(() => rolesData?.roles ?? [], [rolesData?.roles])
  const rolesForbidden = rolesError && (rolesQueryError as { status?: number })?.status === 403

  useEffect(() => {
    if (!open) {
      setStep(1)
      setFullName('')
      setEmail('')
      setRoleId('')
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
    if (!roleId || !email.trim()) return
    await createInvitation({
      invited_name: fullName.trim() || undefined,
      invited_email: email.trim() || undefined,
      role_id: roleId,
    }).unwrap()
    setStep(2)
  }

  const resetForAnother = () => {
    setFullName('')
    setEmail('')
    setStep(1)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
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
                  Email (required — invitee must sign up with this address)
                </span>
                <input
                  type="email"
                  required
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Role</span>
                <Select
                  value={roleId}
                  onValueChange={(value) => {
                    const id = value
                    setRoleId(id)
                    const role = roles.find((r) => r.id === id)
                    setSelectedRoleName(role?.name ?? '')
                  }}
                >
                  <SelectTrigger className="mt-1">
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                {selectedRoleName && ROLE_HELP[selectedRoleName] && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {ROLE_HELP[selectedRoleName]}
                  </p>
                )}
              </label>
              <Button
                type="button"
                className="w-full"
                disabled={
                  isLoading || !roleId || !email.trim() || roles.length === 0 || rolesLoading
                }
                onClick={() => handleGenerate().catch(() => {})}
              >
                Generate Invite Link
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Invitation Sent
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                An invitation has been sent to <strong>{email}</strong>. They&apos;ll receive an
                email with a link to join.
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
                  Invite another person
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
