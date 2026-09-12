import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Select, SelectTrigger } from '../ui/select'
import { useCreateBranchInvitationMutation, useGetBranchInviteRolesQuery } from '../../services/api'

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
  const { data: rolesData } = useGetBranchInviteRolesQuery(
    { supplier_id: supplierId },
    { skip: !open || !supplierId }
  )

  useEffect(() => {
    if (!open) {
      setManagerName('')
      setManagerEmail('')
      setRoleId('')
      setSubmitted(false)
    }
  }, [open])

  useEffect(() => {
    const roles = rolesData?.roles ?? []
    if (roles.length && !roleId) {
      const preferred = roles.find((r) => r.name === 'Manager') ?? roles[0]
      setRoleId(preferred.id)
    }
  }, [rolesData, roleId])

  const selectedRoleName = (rolesData?.roles ?? []).find((r) => r.id === roleId)?.name

  const handleGenerate = async () => {
    if (!roleId || !managerEmail.trim()) return
    await createInvitation({
      supplier_id: supplierId,
      invited_name: managerName.trim() || undefined,
      invited_email: managerEmail.trim() || undefined,
      role_id: roleId,
    }).unwrap()
    setSubmitted(true)
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
                  {(rolesData?.roles ?? []).map((role) => (
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
              disabled={isLoading || !roleId}
              onClick={() => handleGenerate().catch(() => {})}
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
