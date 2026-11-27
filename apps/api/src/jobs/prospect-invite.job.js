/**
 * Asynchronous prospect matching and invite dispatch (spec §6.2 item 1, §11.4 customer import).
 *
 * The supplier-facing import and invite handlers only persist rows and enqueue work here, so
 * their responses (body, status and timing) never depend on whether an imported contact is a
 * Supplify restaurant. Matching and the matched/unmatched branch run after the response.
 */
import { logger } from '../lib/logger.js'
import {
  matchProspectsForSupplier,
  matchSingleProspect,
} from '../services/supplier-customer-matching.service.js'
import { dispatchMatchedFollowInvite } from '../services/supplier-connection-request.service.js'
import { sendUnmatchedProspectInvite } from '../services/supplier-growth-invitation.service.js'

const pending = new Set()

function track(name, fn) {
  const task = new Promise((resolve) => setImmediate(resolve))
    .then(fn)
    .catch((error) => {
      logger.error({ event: `prospect_job.${name}_failed`, error: error?.message })
    })
    .finally(() => pending.delete(task))
  pending.add(task)
  return undefined
}

/** Match a freshly imported batch in the background (exact email/phone only). */
export function enqueueProspectMatch({ supplierId, batchId }) {
  return track('match', () => matchProspectsForSupplier(supplierId, { batchId }))
}

/**
 * Dispatch one invite: matched restaurant → in-app follow invite (silently dropped when the
 * restaurant blocked the supplier); unmatched → email for the email channel. The other
 * channels (link, WhatsApp) are shared by the supplier itself.
 */
export async function dispatchProspectInvite({ supplierId, prospectId, invitationId, channel }) {
  const match = await matchSingleProspect(prospectId)
  if (!match) return { outcome: 'missing' }
  if (match.matchedRestaurantId) {
    const outcome = await dispatchMatchedFollowInvite({
      supplierId,
      prospectId,
      restaurantId: match.matchedRestaurantId,
    })
    return { outcome }
  }
  if (channel === 'email') {
    await sendUnmatchedProspectInvite({ supplierId, prospectId, invitationId })
    return { outcome: 'emailed' }
  }
  return { outcome: 'shared_by_supplier' }
}

export function enqueueProspectInvite(args) {
  return track('invite', () => dispatchProspectInvite(args))
}

/** Number of queued or running jobs (tests and graceful shutdown). */
export function pendingProspectJobs() {
  return pending.size
}

/** Await every queued job, including jobs enqueued while draining. */
export async function drainProspectJobs() {
  while (pending.size) {
    await Promise.all([...pending])
  }
}
