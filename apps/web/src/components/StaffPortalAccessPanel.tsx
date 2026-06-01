import { toast } from 'react-hot-toast'
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

const statusLabels: Record<string, string> = {
  none: 'No portal account',
  invited: 'Invited',
  active: 'Active',
  disabled: 'Disabled',
}

interface StaffPortalAccessPanelProps {
  member: StaffMember
  canManage: boolean
}

export function StaffPortalAccessPanel({ member, canManage }: StaffPortalAccessPanelProps) {
  const portal = member.portalAccess
  const status = portal?.status ?? 'none'

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
      toast.success('Invite email sent')
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

  if (!canManage) {
    return (
      <div className="mt-2 text-xs text-[var(--text-muted)]">
        Portal: {statusLabels[status] ?? status}
        {portal?.lastLoginAt
          ? ` · Last login ${new Date(portal.lastLoginAt).toLocaleString()}`
          : null}
      </div>
    )
  }

  return (
    <div className="mt-3 w-full space-y-2 border-t border-[var(--app-border)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">Staff portal</span>
        <Badge variant={status === 'active' ? 'default' : 'outline'}>
          {statusLabels[status] ?? status}
        </Badge>
        {portal?.lastLoginAt ? (
          <span className="text-xs text-[var(--text-muted)]">
            Last login {new Date(portal.lastLoginAt).toLocaleString()}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {status === 'none' || status === 'disabled' ? (
          <Button size="sm" variant="outline" disabled={creating} onClick={handleCreate}>
            {creating ? 'Creating…' : 'Create portal account'}
          </Button>
        ) : null}
        {status === 'invited' || status === 'active' ? (
          <>
            <Button size="sm" variant="outline" disabled={inviting} onClick={handleInvite}>
              {inviting ? 'Sending…' : status === 'invited' ? 'Resend invite' : 'Send login invite'}
            </Button>
            <Button size="sm" variant="outline" disabled={copying} onClick={handleCopyLink}>
              {copying ? 'Copying…' : 'Copy login link'}
            </Button>
            {status === 'active' ? (
              <>
                <Button size="sm" variant="outline" disabled={resetting} onClick={handleReset}>
                  {resetting ? 'Resetting…' : 'Reset access'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={disabling}
                  onClick={handleDisable}
                >
                  {disabling ? 'Disabling…' : 'Disable access'}
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
