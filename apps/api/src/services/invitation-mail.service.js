import { sendTemplateEmail } from './email/email.service.js'
import { logger } from '../lib/logger.js'

/**
 * Send team invitation email (branch/supplier/restaurant).
 */
export async function sendTeamInvitationEmail({
  to,
  inviteUrl,
  invitedName,
  tenantName,
  tenantType,
  invitationId,
  tenantId,
}) {
  if (!to || !inviteUrl) {
    logger.warn('Team invite email skipped — missing to or inviteUrl')
    return { delivered: false, skipped: true }
  }

  const greeting = invitedName ? `Hi ${invitedName},` : 'Hi,'
  const orgLabel =
    tenantType === 'SUPPLIER'
      ? 'supplier team'
      : tenantType === 'RESTAURANT'
        ? 'restaurant team'
        : 'team'

  return sendTemplateEmail({
    to,
    template: 'auth.team_invite',
    data: {
      message: `${greeting}\n\nYou have been invited to join ${tenantName || `a ${orgLabel}`} on Supplify.`,
      inviteUrl,
      tenantName,
      tenantType,
    },
    tenantId,
    eventType: 'auth.team_invite',
    eventKey: invitationId ? `invite:${invitationId}:created` : `invite:${to}:${Date.now()}`,
    entityId: invitationId,
  })
}
