import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import type { StaffMember } from '../types'
import { getApiErrorMessage } from '../lib/apiError'
import {
  useCreateStaffPortalAccountMutation,
  useSendStaffPortalInviteMutation,
  useLazyGetStaffPortalLoginLinkQuery,
  useResetStaffPortalAccessMutation,
  useDisableStaffPortalAccessMutation,
} from '../services/staffApi'
import { cn } from '../lib/utils'
import { ensureNamespace } from '../i18n'

interface StaffPortalAccessPanelProps {
  member: StaffMember
  canManage: boolean
  compact?: boolean
}

export function StaffPortalAccessPanel({
  member,
  canManage,
  compact = false,
}: StaffPortalAccessPanelProps) {
  const { t } = useTranslation('staff')

  useEffect(() => {
    void ensureNamespace('staff')
  }, [])

  const portal = member.portalAccess
  const status = portal?.status ?? 'none'
  const magicLinkOnly = Boolean(portal?.magicLinkEnabled)
  const statusKey = magicLinkOnly
    ? 'magicLink'
    : (status as 'none' | 'invited' | 'active' | 'disabled')
  const label = t(`portalAccess.status.${statusKey}`, { defaultValue: status })

  const [createAccount, { isLoading: creating }] = useCreateStaffPortalAccountMutation()
  const [sendInvite, { isLoading: inviting }] = useSendStaffPortalInviteMutation()
  const [fetchLoginLink, { isLoading: copying }] = useLazyGetStaffPortalLoginLinkQuery()
  const [resetAccess, { isLoading: resetting }] = useResetStaffPortalAccessMutation()
  const [disableAccess, { isLoading: disabling }] = useDisableStaffPortalAccessMutation()

  const displayName = member.displayName || member.email || t('team.addStaff')

  const handleCreate = async () => {
    if (!member.email) {
      toast.error(t('portalAccess.toast.emailRequired'))
      return
    }
    try {
      const result = await createAccount(member.id).unwrap()
      if (result.temporaryPassword) {
        await navigator.clipboard.writeText(result.temporaryPassword)
        toast.success(t('portalAccess.toast.accountCreatedWithPassword', { name: displayName }))
      } else {
        toast.success(t('portalAccess.toast.accountCreated', { name: displayName }))
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portalAccess.errors.createFailed')))
    }
  }

  const handleInvite = async () => {
    try {
      await sendInvite(member.id).unwrap()
      toast.success(
        t('portalAccess.toast.inviteSent', { email: member.email ?? t('team.noEmail') })
      )
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portalAccess.errors.inviteFailed')))
    }
  }

  const handleCopyLink = async () => {
    try {
      const result = await fetchLoginLink(member.id).unwrap()
      await navigator.clipboard.writeText(result.loginUrl)
      if (result.linkType === 'magic') {
        toast.success(t('portalAccess.toast.magicLinkCopied', { name: displayName }))
      } else {
        toast.success(t('portalAccess.toast.loginLinkCopied', { name: displayName }))
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portalAccess.errors.copyFailed')))
    }
  }

  const handleReset = async () => {
    try {
      const result = await resetAccess(member.id).unwrap()
      if (result.temporaryPassword) {
        await navigator.clipboard.writeText(result.temporaryPassword)
        toast.success(t('portalAccess.toast.resetWithPassword', { name: displayName }))
      } else {
        toast.success(t('portalAccess.toast.resetDone', { name: displayName }))
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portalAccess.errors.resetFailed')))
    }
  }

  const handleDisable = async () => {
    try {
      await disableAccess(member.id).unwrap()
      toast.success(t('portalAccess.toast.disabled', { name: displayName }))
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portalAccess.errors.disableFailed')))
    }
  }

  const badgeVariant =
    status === 'active' ? 'default' : status === 'disabled' ? 'destructive' : 'outline'

  const canSharePortalLink =
    magicLinkOnly || status === 'invited' || (status === 'active' && Boolean(portal?.enabled))

  if (!canManage) {
    return (
      <p className={cn('text-xs text-[var(--text-muted)]', compact ? 'mt-1' : 'mt-2')}>
        {t('portalAccess.readOnly', { status: label })}
        {portal?.lastLoginAt
          ? t('portalAccess.readOnlyLastLogin', {
              date: new Date(portal.lastLoginAt).toLocaleString(),
            })
          : null}
      </p>
    )
  }

  return (
    <div
      className={cn(
        'space-y-2',
        compact
          ? 'mt-3 border-t border-[var(--app-border)] pt-3'
          : 'mt-3 w-full border-t border-[var(--app-border)] pt-3'
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-mid)]">
            {t('portalAccess.sectionTitle')}
          </span>
          <Badge
            variant={badgeVariant}
            className={magicLinkOnly ? 'bg-[var(--brand-pale)] text-[var(--brand-mid)]' : undefined}
          >
            {label}
          </Badge>
          {portal?.lastLoginAt ? (
            <span className="text-xs text-[var(--text-muted)]">
              {t('portalAccess.lastLogin', {
                date: new Date(portal.lastLoginAt).toLocaleDateString(),
              })}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            {t('portalAccess.sectionHint')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {!portal?.hasAccount && (status === 'none' || status === 'disabled' || magicLinkOnly) ? (
          <Button
            size="sm"
            variant="outline"
            className="consumer-pressable min-h-9"
            disabled={creating}
            onClick={handleCreate}
          >
            {creating
              ? t('portalAccess.buttons.creating')
              : t('portalAccess.buttons.createAccount')}
          </Button>
        ) : null}
        {canSharePortalLink ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="consumer-pressable min-h-9"
              disabled={inviting}
              onClick={handleInvite}
            >
              {inviting
                ? t('portalAccess.buttons.sending')
                : magicLinkOnly
                  ? t('portalAccess.buttons.sendMagicLink')
                  : t('portalAccess.buttons.sendLoginInvite')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="consumer-pressable min-h-9"
              disabled={copying}
              onClick={handleCopyLink}
            >
              {copying
                ? t('portalAccess.buttons.copying')
                : magicLinkOnly
                  ? t('portalAccess.buttons.copyMagicLink')
                  : t('portalAccess.buttons.copyLoginLink')}
            </Button>
          </>
        ) : null}
        {portal?.hasAccount && status === 'active' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="consumer-pressable min-h-9"
              disabled={resetting}
              onClick={handleReset}
            >
              {resetting
                ? t('portalAccess.buttons.resetting')
                : t('portalAccess.buttons.resetAccess')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="consumer-pressable min-h-9"
              disabled={disabling}
              onClick={handleDisable}
            >
              {disabling ? t('portalAccess.buttons.disabling') : t('portalAccess.buttons.disable')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
