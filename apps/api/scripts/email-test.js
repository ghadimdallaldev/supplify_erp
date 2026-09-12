#!/usr/bin/env node
/**
 * Send a test email using configured EMAIL_TEST_TO or first CLI argument.
 * Usage: pnpm --filter @supplify/api email:test
 *        pnpm --filter @supplify/api email:test someone@example.com
 */
import { config } from '../src/config/env.js'
import { sendTemplateEmail, logEmailBootMode } from '../src/services/email/email.service.js'

const to = process.argv[2] || config.EMAIL_TEST_TO

if (!to) {
  console.error('Set EMAIL_TEST_TO or pass recipient: node scripts/email-test.js user@example.com')
  process.exit(1)
}

logEmailBootMode()

const result = await sendTemplateEmail({
  to,
  template: 'auth.test',
  subject: 'Supplify email test',
  data: {
    message: 'This is a test email from the Supplify email:test script.',
  },
  eventType: 'test',
  eventKey: `script:test:${to}:${Date.now()}`,
  skipDedup: true,
})

console.log(JSON.stringify(result, null, 2))
process.exit(result.sent || result.logOnly ? 0 : 1)
