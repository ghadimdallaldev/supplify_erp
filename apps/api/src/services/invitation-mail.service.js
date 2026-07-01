import { sendTemplateEmail } from './email/email.service.js'
import { logger } from '../lib/logger.js'
import { buildAppUrl } from '../lib/app-url.js'

/**
 * Send team invitation email (branch/supplier/restaurant/referral).
 */
export async function sendTeamInvitationEmail({
  to,
  inviteUrl,
  invitedName,
  tenantName,
  tenantType,
  invitationId,
  tenantId,
  locale,
}) {
  if (!to || !inviteUrl) {
    logger.warn('Team invite email skipped — missing to or inviteUrl')
    return { delivered: false, skipped: true }
  }

  const resolvedInviteUrl = inviteUrl.startsWith('http') ? inviteUrl : buildAppUrl(inviteUrl)

  const result = await sendTemplateEmail({
    to,
    template: 'auth.team_invite',
    locale,
    data: {
      inviteUrl: resolvedInviteUrl,
      invitedName,
      tenantName,
      tenantType,
      ctaUrl: resolvedInviteUrl,
    },
    tenantId,
    eventType: 'auth.team_invite',
    eventKey: invitationId ? `invite:${invitationId}:created` : `invite:${to}:${Date.now()}`,
    entityId: invitationId,
  })

  return {
    delivered: Boolean(result.sent || result.logOnly || result.preview),
    ...result,
  }
}
