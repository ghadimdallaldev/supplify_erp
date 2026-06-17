import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Select, SelectTrigger } from '../ui/select'
import {
  useCreateRestaurantOrgBranchMutation,
  useCreateRestaurantBranchInvitationMutation,
  useGetRestaurantBranchInviteRolesQuery,
} from '../../services/api'

type Props = {
  open: boolean
  onClose: () => void
}

export function RestaurantAddBranchModal({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [branchId, setBranchId] = useState<string | null>(null)
  const [managerName, setManagerName] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [createBranch, { isLoading: creating }] = useCreateRestaurantOrgBranchMutation()
  const [createInvitation, { isLoading: inviting }] = useCreateRestaurantBranchInvitationMutation()
  const { data: rolesData } = useGetRestaurantBranchInviteRolesQuery(
    { restaurant_id: branchId! },
    { skip: !branchId || step !== 2 }
  )

  useEffect(() => {
    if (!open) {
      setStep(1)
      setName('')
      setAddress('')
      setPhone('')
      setBranchCode('')
      setBranchId(null)
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

  const handleCreateBranch = async () => {
    if (!name.trim()) return
    const result = await createBranch({
      name: name.trim(),
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      branch_code: branchCode.trim() || undefined,
    }).unwrap()
    const branch = (result as { branch?: { id: string } }).branch
    const id = branch?.id ?? (result as { id?: string }).id
    if (!id) return
    setBranchId(id)
    setStep(2)
  }

  const handleGenerateLink = async () => {
    if (!branchId || !roleId) return
    const result = await createInvitation({
      restaurant_id: branchId,
      invited_name: managerName.trim() || undefined,
      invited_email: managerEmail.trim() || undefined,
      role_id: roleId,
    }).unwrap()
    setInviteUrl(result.invite_url)
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const resetInviteForm = () => {
    setManagerName('')
    setManagerEmail('')
    setInviteUrl(null)
    setCopied(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Add branch</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleCreateBranch().catch(() => {})
              }}
            >
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Branch name</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Address</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Phone</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--text-muted)]">Branch code (optional)</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                />
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={creating}>
                  Create Branch
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Branch created! Invite your branch manager.</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-[var(--text-muted)]">
              Share an invite link with your branch manager (no email is sent).
            </p>
            {!inviteUrl ? (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-[var(--text-muted)]">Manager name</span>
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--text-muted)]">
                    Manager email (for your reference — no email will be sent)
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
                <Button
                  type="button"
                  className="w-full"
                  disabled={inviting || !roleId}
                  onClick={() => handleGenerateLink().catch(() => {})}
                >
                  Generate Invite Link
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-[var(--app-border)] p-3 space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    Invite link (expires in 7 days)
                  </p>
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
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={onClose}>
                    Done
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={resetInviteForm}
                  >
                    Invite Another Person
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
