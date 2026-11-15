import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('../lib/ai/index.js', () => ({ getAiProvider: vi.fn() }))
vi.mock('../lib/ai-platform.js', () => ({
  isAiEnvEnabled: () => true,
  isAiAssistantEnabledForTenant: vi.fn(async () => true),
}))
vi.mock('../lib/subscription.js', () => ({
  reserveAiUsage: vi.fn(async () => ({ allowed: true })),
  refundReservedAiUsage: vi.fn(),
  getAiUsageSummary: vi.fn(async () => ({ remaining: 9 })),
}))
vi.mock('./assistant-tools/index.js', () => ({
  resolveAvailableTools: vi.fn(async () => ({ names: ['get_inventory'], definitions: [] })),
  executeAssistantTool: vi.fn(),
}))
vi.mock('../lib/driver-rbac.js', () => ({ getLinkedDriverId: vi.fn(async () => null) }))
vi.mock('../lib/impersonation.js', () => ({ isImpersonating: () => false }))
vi.mock('./storage/storage.service.js', () => ({ getObjectStream: vi.fn() }))
vi.mock('./storage/upload-security.service.js', () => ({
  assertCleanUploadOwnership: vi.fn(),
  ensureObjectCleanForRead: vi.fn(),
}))
vi.mock('../lib/sanitize-upload.js', () => ({
  resolveUploadKeyFromPublicUrl: () => 'safe/file.pdf',
}))
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
import { query } from '../lib/db.js'
import { getAiProvider } from '../lib/ai/index.js'
import { isAiAssistantEnabledForTenant } from '../lib/ai-platform.js'
import { getObjectStream } from './storage/storage.service.js'
import {
  assertCleanUploadOwnership,
  ensureObjectCleanForRead,
} from './storage/upload-security.service.js'
import {
  prepareAssistantAttachments,
  sendAssistantMessage,
  listMessages,
} from './assistant-chat.service.js'

const ctx = { userId: 'u1', tenantId: 'r1', tenantType: 'RESTAURANT' }
const req = {
  userData: { id: 'u1', role: 'RESTAURANT' },
  tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT', permissions: ['INVENTORY_VIEW'] },
}
const attachment = {
  fileUrl: 'https://storage.example/safe/file.pdf',
  fileName: 'Order sheet.pdf',
  fileType: 'application/pdf',
  fileSize: 20,
}
beforeEach(() => {
  vi.clearAllMocks()
  isAiAssistantEnabledForTenant.mockResolvedValue(true)
  assertCleanUploadOwnership.mockResolvedValue({ content_type: 'application/pdf' })
  getObjectStream.mockResolvedValue({ body: Buffer.from('%PDF-1.7\nfixture') })
  ensureObjectCleanForRead.mockImplementation(async (_, object) => object)
})
describe('assistant documents and history', () => {
  it('sends approved PDF bytes as inline file content, not just a filename', async () => {
    const result = await prepareAssistantAttachments(ctx, [attachment])
    expect(result.imageParts[0]).toMatchObject({
      type: 'file',
      file: { filename: 'Order sheet.pdf' },
    })
    expect(result.imageParts[0].file.file_data).toMatch(/^data:application\/pdf;base64,/)
    expect(assertCleanUploadOwnership).toHaveBeenCalledWith('safe/file.pdf', ctx)
    expect(ensureObjectCleanForRead).toHaveBeenCalled()
  })
  it('rejects spoofed MIME, unreadable PDFs, and oversized buffers', async () => {
    assertCleanUploadOwnership.mockResolvedValueOnce({ content_type: 'image/png' })
    await expect(prepareAssistantAttachments(ctx, [attachment])).rejects.toThrow('type')
    getObjectStream.mockResolvedValueOnce({ body: Buffer.from('not a pdf') })
    await expect(prepareAssistantAttachments(ctx, [attachment])).rejects.toThrow('PDF')
    getObjectStream.mockResolvedValueOnce({ body: Buffer.alloc(10 * 1024 * 1024 + 1) })
    await expect(prepareAssistantAttachments(ctx, [attachment])).rejects.toThrow('large')
  })
  it('checks entitlement before retrieving private file contents', async () => {
    getAiProvider.mockReturnValue({ completeWithTools: vi.fn() })
    isAiAssistantEnabledForTenant.mockResolvedValue(false)
    await expect(
      sendAssistantMessage(req, { message: 'review', attachments: [attachment] })
    ).rejects.toThrow('plan')
    expect(getObjectStream).not.toHaveBeenCalled()
  })
  it('loads latest history in stable chronological order and scopes pagination cursor', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'conv' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new' }, { id: 'old' }] })
    expect(await listMessages(ctx, 'conv', { before: 'cursor', limit: 51 })).toEqual([
      { id: 'old' },
      { id: 'new' },
    ])
    expect(query.mock.calls[1][0]).toContain('created_at DESC, id DESC')
    expect(query.mock.calls[1][0]).toContain('id = $3 AND conversation_id = $1')
    expect(query.mock.calls[1][1]).toEqual(['conv', 51, 'cursor'])
  })
  it('keeps historical references as refreshable context and untrusted documents in the prompt', async () => {
    const provider = {
      completeWithTools: vi.fn(async () => ({
        reply: 'Checked',
        sources: [],
        tokensIn: 1,
        tokensOut: 1,
        latencyMs: 1,
      })),
    }
    getAiProvider.mockReturnValue(provider)
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM assistant_conversation')) return { rows: [{ id: 'conv' }] }
      if (sql.includes('SELECT role, content, tool_payload'))
        return {
          rows: [
            { role: 'user', content: 'how about that one?' },
            {
              role: 'assistant',
              content: 'Earlier answer',
              tool_payload: { references: [{ productId: 'p1', productName: 'Tomato' }] },
            },
          ],
        }
      return { rows: [] }
    })
    await sendAssistantMessage(req, { conversationId: 'conv', message: 'how about that one?' })
    const call = provider.completeWithTools.mock.calls[0][0]
    expect(call.system).toContain('untrusted DATA')
    expect(call.system).toContain('Keep currencies separate')
    expect(call.messages[0].content).toContain('Historical record references')
    expect(call.messages[0].content).toContain('p1')
  })
})
