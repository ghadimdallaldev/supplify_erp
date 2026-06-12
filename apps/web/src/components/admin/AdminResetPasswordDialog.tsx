import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Loader2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useResetAdminUserPasswordMutation } from '../../services/api'

export type AdminResetPasswordTarget = {
  userId?: string
  email: string
  displayName?: string | null
}

export function AdminResetPasswordDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: AdminResetPasswordTarget | null
}) {
  const [resetPassword, { isLoading }] = useResetAdminUserPasswordMutation()
  const [useCustomPassword, setUseCustomPassword] = useState(false)
  const [customPassword, setCustomPassword] = useState('')
  const [temporary, setTemporary] = useState(true)
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setUseCustomPassword(false)
      setCustomPassword('')
      setTemporary(true)
      setIssuedPassword(null)
    }
  }, [open])

  const handleReset = async () => {
    if (!target) return
    if (useCustomPassword && customPassword.length < 10) {
      toast.error('Password must be at least 10 characters')
      return
    }
    try {
      const result = await resetPassword({
        userId: target.userId,
        email: target.userId ? undefined : target.email,
        password: useCustomPassword ? customPassword : undefined,
        temporary: useCustomPassword ? temporary : true,
        generate: !useCustomPassword,
      }).unwrap()
      if (result.temporaryPassword) {
        setIssuedPassword(result.temporaryPassword)
        toast.success('Temporary password set — copy it now')
      } else {
        toast.success('Password updated')
        onOpenChange(false)
      }
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to reset password'
      toast.error(msg)
    }
  }

  const copyPassword = async () => {
    if (!issuedPassword) return
    try {
      await navigator.clipboard.writeText(issuedPassword)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {target
              ? `Set a new sign-in password for ${target.displayName || target.email}. Changes apply in Keycloak immediately.`
              : 'Select a user to reset their password.'}
          </DialogDescription>
        </DialogHeader>

        {target && !issuedPassword && (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)] px-3 py-2 text-sm">
              <p className="font-medium text-[var(--text)]">{target.displayName || 'User'}</p>
              <p className="text-[var(--text-muted)]">{target.email}</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={!useCustomPassword}
                onChange={(e) => setUseCustomPassword(!e.target.checked)}
                className="rounded border-[var(--app-border-mid)]"
              />
              Generate a secure temporary password
            </label>

            {useCustomPassword && (
              <>
                <div>
                  <Label htmlFor="adminNewPassword">New password</Label>
                  <Input
                    id="adminNewPassword"
                    type="text"
                    autoComplete="new-password"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    className="mt-1.5"
                    placeholder="Min. 10 chars, upper, lower, number"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={temporary}
                    onChange={(e) => setTemporary(e.target.checked)}
                    className="rounded border-[var(--app-border-mid)]"
                  />
                  Require new password on next login (Keycloak screen — not a name change in
                  Supplify)
                </label>
              </>
            )}
          </div>
        )}

        {issuedPassword && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-950">Temporary password (shown once)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-sm text-[var(--text)]">
                {issuedPassword}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyPassword()}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-900/80">
              Share this securely with the user. On next sign-in, Keycloak will ask them to set a
              new password (not first/last name — those are filled from their profile in Supplify).
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {issuedPassword ? 'Done' : 'Cancel'}
          </Button>
          {!issuedPassword && (
            <Button
              type="button"
              onClick={() => void handleReset()}
              disabled={isLoading || !target}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Resetting…
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
