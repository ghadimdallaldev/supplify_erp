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

const statusLabels: Record<string, string> = {
  none: 'No portal access',
  invited: 'Invite pending',
  active: 'Portal active',
  disabled: 'Access disabled',
}

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
  const portal = member.portalAccess
  const status = portal?.status ?? 'none'
  const magicLinkOnly = Boolean(portal?.magicLinkEnabled)
  const label = magicLinkOnly ? 'Magic link' : (statusLabels[status] ?? status)

  const [createAccount, { isLoading: creating }] = useCreateStaffPortalAccountMutation()
  const [sendInvite, { isLoading: inviting }] = useSendStaffPortalInviteMutation()
  const [fetchLoginLink, { isLoading: copying }] = useLazyGetStaffPortalLoginLinkQuery()
  const [resetAccess, { isLoading: resetting }] = useResetStaffPortalAccessMutation()
  const [disableAccess, { isLoading: disabling }] = useDisableStaffPortalAccessMutation()

  const handleCreate = async () => {
    if (!member.email) {
      toast.error('Add a work email before creating a portal account')
      return
    }
    try {
      const result = await createAccount(member.id).unwrap()
      if (result.temporaryPassword) {
        await navigator.clipboard.writeText(result.temporaryPassword)
        toast.success('Portal account created. Temporary password copied to clipboard.')
      } else {
        toast.success('Portal account is ready')
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to create portal account'))
    }
  }

  const handleInvite = async () => {
    try {
      await sendInvite(member.id).unwrap()
      toast.success('Sign-in link sent to their work email')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to send invite'))
    }
  }

  const handleCopyLink = async () => {
    try {
      const result = await fetchLoginLink(member.id).unwrap()
      await navigator.clipboard.writeText(result.loginUrl)
      toast.success('Staff login link copied')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to copy login link'))
    }
  }

  const handleReset = async () => {
    try {
      const result = await resetAccess(member.id).unwrap()
      if (result.temporaryPassword) {
        await navigator.clipboard.writeText(result.temporaryPassword)
        toast.success('Access reset. New temporary password copied.')
      } else {
        toast.success('Portal access reset')
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to reset access'))
    }
  }

  const handleDisable = async () => {
    try {
      await disableAccess(member.id).unwrap()
      toast.success('Staff portal access disabled')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to disable access'))
    }
  }

  const badgeVariant =
    status === 'active' ? 'default' : status === 'disabled' ? 'destructive' : 'outline'

  if (!canManage) {
    return (
      <p className={cn('text-xs text-[var(--text-muted)]', compact ? 'mt-1' : 'mt-2')}>
        Portal: {label}
        {portal?.lastLoginAt
          ? ` · Last login ${new Date(portal.lastLoginAt).toLocaleString()}`
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-mid)]">Staff portal</span>
        <Badge
          variant={badgeVariant}
          className={magicLinkOnly ? 'bg-[var(--brand-pale)] text-[var(--brand-mid)]' : undefined}
        >
          {label}
        </Badge>
        {portal?.lastLoginAt ? (
          <span className="text-xs text-[var(--text-muted)]">
            Last login {new Date(portal.lastLoginAt).toLocaleDateString()}
          </span>
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
            {creating ? 'Creating…' : 'Add password login'}
          </Button>
        ) : null}
        {magicLinkOnly || status === 'invited' || (status === 'active' && portal?.hasAccount) ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="consumer-pressable min-h-9"
              disabled={inviting}
              onClick={handleInvite}
            >
              {inviting ? 'Sending…' : magicLinkOnly ? 'Send magic link' : 'Send login invite'}
            </Button>
            {portal?.hasAccount ? (
              <Button
                size="sm"
                variant="outline"
                className="consumer-pressable min-h-9"
                disabled={copying}
                onClick={handleCopyLink}
              >
                {copying ? 'Copying…' : 'Copy login link'}
              </Button>
            ) : null}
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
              {resetting ? 'Resetting…' : 'Reset access'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="consumer-pressable min-h-9"
              disabled={disabling}
              onClick={handleDisable}
            >
              {disabling ? 'Disabling…' : 'Disable'}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
