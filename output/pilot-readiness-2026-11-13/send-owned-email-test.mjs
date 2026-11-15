import { sendTemplateEmail } from '../../apps/api/src/services/email/email.service.js'
import { pool } from '../../apps/api/src/lib/db.js'

try {
  const result = await sendTemplateEmail({
    to: 'ghadimdallaldev@outlook.com',
    template: 'auth.team_invite',
    subject: 'Supplify pilot readiness: invitation template test',
    locale: 'en',
    data: {
      tenantName: 'Supplify pilot verification',
      invitedName: 'Ghadi',
      message: 'This is the invitation email delivery test you requested. No customer workspace has been created by this test. The button opens Supplify.',
      inviteUrl: 'https://app.supplifyerp.com/',
    },
    skipDedup: true,
    throwOnError: true,
  })
  console.log(JSON.stringify({ test: 'production-config invitation template', ...result }))
} finally {
  await pool.end()
}
