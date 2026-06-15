import { runSponsorshipExpiryJob } from '../services/supplier-sponsorship.service.js'
import { expireOldGrowthInvitations } from '../services/supplier-growth-invitation.service.js'
import { expireConnectionRequests } from '../services/supplier-connection-request.service.js'
import { logger } from '../lib/logger.js'

export async function runGrowthProgramMaintenanceJob() {
  const [sponsorship, invitations, connections] = await Promise.all([
    runSponsorshipExpiryJob(),
    expireOldGrowthInvitations(),
    expireConnectionRequests(),
  ])
  logger.info('Growth program maintenance job completed', {
    sponsorshipExpired: sponsorship.expired,
    invitationsExpired: invitations,
    connectionsExpired: connections,
  })
  return { sponsorship, invitations, connections }
}
