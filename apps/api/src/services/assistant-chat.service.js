import { query } from '../lib/db.js'
import { getAiProvider } from '../lib/ai/index.js'
import {
  isAiEnvEnabled,
  isAiPlatformEnabledForTenant,
} from '../lib/ai-platform.js'
import {
  reserveAiUsage,
  refundReservedAiUsage,
  getAiUsageSummary,
} from '../lib/subscription.js'
import { NotFoundError, ValidationError, ForbiddenError } from '../middlewares/errorHandler.js'
import { logger } from '../lib/logger.js'
import { resolveAvailableTools, executeAssistantTool } from './assistant-tools/index.js'
import { getLinkedDriverId } from '../lib/driver-rbac.js'
import { isImpersonating } from '../lib/impersonation.js'
import { hasPermission } from '../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'

const HISTORY_LIMIT = 10

function buildSystemPrompt({ locale, toolNames }) {
  const lang = locale === 'ar' ? 'Arabic' : 'English'
  return `You are Supplify Assistant, a read-only help desk for a restaurant–supplier marketplace ERP.
Answer in ${lang}. Be concise and factual.
Rules:
- Use only data returned by tools. Never invent quantities, prices, ETAs, invoice totals, or order statuses.
- If a tool returns no match, say so clearly.
- You cannot place orders, change stock, assign drivers, or mutate any data. If asked to take an action, refuse and tell the user which screen to use instead.
- Prefer calling tools before answering numerical or status questions.
- Available tools: ${toolNames.join(', ') || 'none'}.
- When citing stock, include quantity and unit (e.g. "12 kg").
- "How much do we still have?" means on-hand inventory. "How much do we need?" means reorder suggestions.`
}

/**
 * Build tool execution context from an Express request + resolved tenant.
 * @param {import('express').Request} req
 */
export async function buildAssistantContext(req) {
  const tenant = req.tenantContext || {}
  const admin = req.adminContext || {}
  const userId = req.userData?.id
  if (!userId) throw new ForbiddenError('Authentication required')

  const isAdminUser = req.userData?.role === 'ADMIN' || Boolean(admin?.permissions?.length)
  const impersonating = isImpersonating(req)
  const tenantType = tenant.tenantType || (isAdminUser && !impersonating ? 'ADMIN' : null)
  const tenantId = tenant.tenantId || null
  const permissions = tenant.permissions || admin.permissions || []
  const roles = tenant.roles || []

  let driverId = null
  if (tenantType === 'SUPPLIER' && tenantId) {
    driverId = await getLinkedDriverId(userId, tenantId)
  }

  return {
    tenantId,
    tenantType,
    userId,
    permissions,
    roles,
    isAdmin: isAdminUser,
    isImpersonating: impersonating,
    driverId,
    preferredLocale: req.userData?.preferred_locale || req.userData?.preferredLocale || 'en',
  }
}

/**
 * Whether the assistant is available for this request context.
 */
export async function resolveAssistantEnabled(ctx) {
  if (!isAiEnvEnabled() || !getAiProvider()?.completeWithTools) {
    return { enabled: false, reason: 'env_disabled', quota: null }
  }

  if (ctx.isAdmin && !ctx.isImpersonating) {
    if (!hasPermission(ctx.permissions, P.ADMIN_ACCESS) && ctx.permissions.length) {
      // Admin context may use ADMIN_ACCESS via role; allow if admin user
    }
    return {
      enabled: true,
      reason: null,
      quota: null,
    }
  }

  if (!ctx.tenantId || !ctx.tenantType || ctx.tenantType === 'ADMIN') {
    return { enabled: false, reason: 'no_tenant', quota: null }
  }

  const platformOn = await isAiPlatformEnabledForTenant(ctx.tenantId, ctx.tenantType)
  if (!platformOn) {
    return { enabled: false, reason: 'feature_disabled', quota: null }
  }

  const quota = await getAiUsageSummary(ctx.tenantId, ctx.tenantType)
  return { enabled: true, reason: null, quota }
}

export async function getAssistantCapabilities(req) {
  const ctx = await buildAssistantContext(req)
  const { enabled, reason, quota } = await resolveAssistantEnabled(ctx)
  if (!enabled) {
    return { enabled: false, reason, quotaRemaining: quota?.remaining ?? 0, tools: [] }
  }
  const { names } = await resolveAvailableTools(ctx)
  return {
    enabled: true,
    reason: null,
    quotaRemaining: quota?.remaining ?? null,
    quota,
    tools: names,
  }
}

export async function listConversations(ctx, { limit = 20, offset = 0 } = {}) {
  const { rows } = await query(
    `
    SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM assistant_conversation
    WHERE user_id = $1
      AND tenant_id = $2
      AND tenant_type = $3
    ORDER BY updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [ctx.userId, ctx.tenantId || ctx.userId, ctx.tenantType || 'ADMIN', limit, offset]
  )
  return rows
}

export async function createConversation(ctx, { title = null } = {}) {
  const { rows } = await query(
    `
    INSERT INTO assistant_conversation (tenant_id, tenant_type, user_id, title)
    VALUES ($1, $2, $3, $4)
    RETURNING id, title, created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [ctx.tenantId || ctx.userId, ctx.tenantType || 'ADMIN', ctx.userId, title]
  )
  return rows[0]
}

async function assertConversationAccess(ctx, conversationId) {
  const { rows } = await query(
    `
    SELECT id FROM assistant_conversation
    WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND tenant_type = $4
    `,
    [conversationId, ctx.userId, ctx.tenantId || ctx.userId, ctx.tenantType || 'ADMIN']
  )
  if (!rows[0]) throw new NotFoundError('Conversation not found')
  return rows[0]
}

export async function listMessages(ctx, conversationId, { limit = 50 } = {}) {
  await assertConversationAccess(ctx, conversationId)
  const { rows } = await query(
    `
    SELECT id, role, content, tool_payload AS "toolPayload", created_at AS "createdAt"
    FROM assistant_message
    WHERE conversation_id = $1 AND role IN ('user', 'assistant')
    ORDER BY created_at ASC
    LIMIT $2
    `,
    [conversationId, limit]
  )
  return rows
}

async function loadHistory(conversationId) {
  const { rows } = await query(
    `
    SELECT role, content
    FROM assistant_message
    WHERE conversation_id = $1 AND role IN ('user', 'assistant')
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [conversationId, HISTORY_LIMIT]
  )
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }))
}

async function insertMessage(conversationId, role, content, toolPayload = null) {
  await query(
    `
    INSERT INTO assistant_message (conversation_id, role, content, tool_payload)
    VALUES ($1, $2, $3, $4)
    `,
    [conversationId, role, content || '', toolPayload ? JSON.stringify(toolPayload) : null]
  )
  await query(`UPDATE assistant_conversation SET updated_at = now() WHERE id = $1`, [
    conversationId,
  ])
}

/**
 * Send a user message and get an assistant reply (tool-calling loop).
 */
export async function sendAssistantMessage(req, { conversationId = null, message }) {
  const text = String(message || '').trim()
  if (!text) throw new ValidationError('message is required')
  if (text.length > 4000) throw new ValidationError('message is too long')

  const ctx = await buildAssistantContext(req)
  const gate = await resolveAssistantEnabled(ctx)
  if (!gate.enabled) {
    throw new ForbiddenError(
      gate.reason === 'feature_disabled'
        ? 'AI Assistant is not enabled on your plan'
        : 'AI Assistant is unavailable'
    )
  }

  const provider = getAiProvider()
  if (!provider?.completeWithTools) {
    throw new ForbiddenError('AI Assistant is unavailable')
  }

  const { names, definitions } = await resolveAvailableTools(ctx)
  if (!names.length) {
    throw new ForbiddenError('No assistant tools available for your role')
  }

  let convId = conversationId
  if (convId) {
    await assertConversationAccess(ctx, convId)
  } else {
    const title = text.length > 60 ? `${text.slice(0, 57)}...` : text
    const conv = await createConversation(ctx, { title })
    convId = conv.id
  }

  await insertMessage(convId, 'user', text)

  // Platform admins are not metered against a tenant plan.
  let usage = null
  const meterTenant = ctx.isAdmin && !ctx.isImpersonating ? null : ctx.tenantId
  const meterType = ctx.isAdmin && !ctx.isImpersonating ? null : ctx.tenantType

  if (meterTenant && meterType) {
    usage = await reserveAiUsage(meterTenant, meterType, 1)
    if (!usage.allowed) {
      await insertMessage(convId, 'assistant', 'AI quota exhausted. Please try again after the reset.', {
        quotaLimited: true,
        resetAt: usage.resetAt || null,
      })
      return {
        conversationId: convId,
        reply:
          'Your AI request quota is exhausted. Upgrade your plan or wait until the quota resets.',
        sources: [],
        usedLlm: false,
        quotaLimited: true,
        quota: usage,
      }
    }
  }

  const history = await loadHistory(convId)
  // History already includes the just-inserted user message; use it as messages.
  const messages = history.map((m) => ({ role: m.role, content: m.content }))

  try {
    const result = await provider.completeWithTools({
      system: buildSystemPrompt({
        locale: ctx.preferredLocale,
        toolNames: names,
      }),
      messages,
      tools: definitions,
      maxRounds: 4,
      executeTool: async (name, args) => {
        const out = await executeAssistantTool(ctx, name, args)
        await insertMessage(convId, 'tool', name, { name, args, result: out })
        return out
      },
    })

    await insertMessage(convId, 'assistant', result.reply, {
      sources: result.sources,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
    })

    const quota =
      meterTenant && meterType ? await getAiUsageSummary(meterTenant, meterType) : null

    return {
      conversationId: convId,
      reply: result.reply,
      sources: result.sources,
      usedLlm: true,
      quota,
    }
  } catch (err) {
    if (meterTenant && meterType && usage) {
      await refundReservedAiUsage(meterTenant, meterType, usage, 1)
    }
    logger.error('assistant message failed', { error: err.message, conversationId: convId })
    throw err
  }
}
