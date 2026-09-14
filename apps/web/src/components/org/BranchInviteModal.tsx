import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Select, SelectTrigger } from '../ui/select'
import { useCreateBranchInvitationMutation, useGetBranchInviteRolesQuery } from '../../services/api'
import { getApiErrorMessage } from '../../lib/apiError'

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
  const [submitted, setSubmitted] = useState(false)

  const [createInvitation, { isLoading }] = useCreateBranchInvitationMutation()
  const {
    data: rolesData,
    isLoading: rolesLoading,
    isError: rolesError,
    error: rolesQueryError,
  } = useGetBranchInviteRolesQuery({ supplier_id: supplierId }, { skip: !open || !supplierId })

  const roles = useMemo(() => rolesData?.roles ?? [], [rolesData?.roles])
  const rolesForbidden = rolesError && (rolesQueryError as { status?: number })?.status === 403
  const rolesErrorMessage = rolesError
    ? getApiErrorMessage(rolesQueryError, 'Could not load invite roles')
    : null

  useEffect(() => {
    if (!open) {
      setManagerName('')
      setManagerEmail('')
      setRoleId('')
      setSubmitted(false)
    }
  }, [open])

  useEffect(() => {
    if (roles.length && !roleId) {
      const preferred =
        roles.find((r) => r.name === 'Driver') ??
        roles.find((r) => r.name === 'Manager') ??
        roles[0]
      setRoleId(preferred.id)
    }
  }, [roles, roleId])

  const selectedRoleName = roles.find((r) => r.id === roleId)?.name

  const handleGenerate = async () => {
    if (!roleId || !managerEmail.trim()) return
    try {
      await createInvitation({
        supplier_id: supplierId,
        invited_name: managerName.trim() || undefined,
        invited_email: managerEmail.trim() || undefined,
        role_id: roleId,
      }).unwrap()
      setSubmitted(true)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to send invitation'))
    }
  }

  const resetForAnother = () => {
    setManagerName('')
    setManagerEmail('')
    setSubmitted(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Invite someone to {branchName ?? 'this branch'}</DialogTitle>
        </DialogHeader>
        {!submitted ? (
          <div className="space-y-3">
            {rolesLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading roles…</p>
            ) : rolesForbidden ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {rolesErrorMessage ||
                  "You don't have permission to invite team members. Ask an owner or manager."}
              </p>
            ) : rolesError ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {rolesErrorMessage}
              </p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No roles are available yet. Refresh and try again, or contact support if this
                persists.
              </p>
            ) : null}
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
                Email (required — invitee must sign up with this address)
              </span>
              <input
                type="email"
                required
                className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Role</span>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger className="mt-1">
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </label>
            {selectedRoleName === 'Driver' && (
              <p className="text-xs text-[var(--text-muted)] rounded-md border border-[var(--app-border)] p-2">
                When they accept, a driver delivery profile is created and linked to their login
                automatically.
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              disabled={
                isLoading || !roleId || !managerEmail.trim() || roles.length === 0 || rolesLoading
              }
              onClick={() => void handleGenerate()}
            >
              Generate Invite Link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <span className="font-medium">Invitation Sent</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              An invitation has been sent to <strong>{managerEmail}</strong>. They&apos;ll receive
              an email with a link to join.
            </p>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={onClose}>
                Done
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={resetForAnother}>
                Invite another person
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
