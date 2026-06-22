import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('admin')
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
      toast.error(t('resetPassword.passwordMinLength'))
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
        toast.success(t('resetPassword.temporarySet'))
      } else {
        toast.success(t('resetPassword.passwordUpdated'))
        onOpenChange(false)
      }
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('resetPassword.resetFailed')
      toast.error(msg)
    }
  }

  const copyPassword = async () => {
    if (!issuedPassword) return
    try {
      await navigator.clipboard.writeText(issuedPassword)
      toast.success(t('resetPassword.copied'))
    } catch {
      toast.error(t('resetPassword.copyFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('resetPassword.title')}</DialogTitle>
          <DialogDescription>
            {target
              ? t('resetPassword.description', { name: target.displayName || target.email })
              : t('resetPassword.selectUser')}
          </DialogDescription>
        </DialogHeader>

        {target && !issuedPassword && (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)] px-3 py-2 text-sm">
              <p className="font-medium text-[var(--text)]">
                {target.displayName || t('common.user')}
              </p>
              <p className="text-[var(--text-muted)]">{target.email}</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={!useCustomPassword}
                onChange={(e) => setUseCustomPassword(!e.target.checked)}
                className="rounded border-[var(--app-border-mid)]"
              />
              {t('resetPassword.generateTemporary')}
            </label>

            {useCustomPassword && (
              <>
                <div>
                  <Label htmlFor="adminNewPassword">{t('resetPassword.newPassword')}</Label>
                  <Input
                    id="adminNewPassword"
                    type="text"
                    autoComplete="new-password"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    className="mt-1.5"
                    placeholder={t('resetPassword.passwordPlaceholder')}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={temporary}
                    onChange={(e) => setTemporary(e.target.checked)}
                    className="rounded border-[var(--app-border-mid)]"
                  />
                  {t('resetPassword.requireChangeOnLogin')}
                </label>
              </>
            )}
          </div>
        )}

        {issuedPassword && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-950">
              {t('resetPassword.temporaryShownOnce')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-sm text-[var(--text)]">
                {issuedPassword}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyPassword()}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-900/80">{t('resetPassword.shareSecurely')}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {issuedPassword ? t('common.done') : t('common.cancel')}
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
                  {t('resetPassword.resetting')}
                </>
              ) : (
                t('resetPassword.title')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
