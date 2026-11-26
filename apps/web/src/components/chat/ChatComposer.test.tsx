import { describe, it, expect, vi } from 'vitest'
import { createRef, type ComponentProps } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ChatComposer } from './ChatComposer'

type Props = ComponentProps<typeof ChatComposer>

function renderComposer(over: Partial<Props> = {}) {
  const props: Props = {
    canSend: true,
    message: '',
    onMessageChange: vi.fn(),
    onSend: vi.fn(),
    onTyping: vi.fn(),
    isSending: false,
    isUploading: false,
    replyingTo: null,
    onClearReply: vi.fn(),
    showEmojiPicker: false,
    onToggleEmojiPicker: vi.fn(),
    onInsertEmoji: vi.fn(),
    showOrderPicker: false,
    onToggleOrderPicker: vi.fn(),
    orders: [],
    selectedOrder: null,
    onSelectOrder: vi.fn(),
    onClearOrder: vi.fn(),
    selectedFiles: [],
    filePreviews: [],
    onFileSelect: vi.fn(),
    onRemoveFile: vi.fn(),
    fileInputRef: createRef<HTMLInputElement>(),
    inputRef: createRef<HTMLTextAreaElement>(),
    userRole: 'RESTAURANT',
    ...over,
  }
  renderWithProviders(<ChatComposer {...props} />)
  return props
}

describe('ChatComposer relationship access', () => {
  it('composer read-only with open-order chip', async () => {
    const props = renderComposer({
      access: {
        canSendGeneral: false,
        closedByBlock: false,
        openOrderIds: ['a1b2c3d4-0000-4000-8000-000000000001'],
      },
    })

    expect(screen.getByTestId('chat-read-only-banner')).toHaveTextContent(/read-only/i)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /message about order #a1b2c3d4/i }))
    expect(props.onSelectOrder).toHaveBeenCalledWith({
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
    })
  })

  it('shows the composer for an order-tagged message when the chosen order is open', () => {
    renderComposer({
      access: {
        canSendGeneral: false,
        closedByBlock: false,
        openOrderIds: ['a1b2c3d4-0000-4000-8000-000000000001'],
      },
      selectedOrder: { id: 'a1b2c3d4-0000-4000-8000-000000000001' },
    })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('read-only with no open order shows only the banner', () => {
    renderComposer({ access: { canSendGeneral: false, closedByBlock: false, openOrderIds: [] } })
    expect(screen.getByTestId('chat-read-only-banner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /message about order/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a block closes the conversation for both sides', () => {
    renderComposer({
      access: {
        canSendGeneral: false,
        closedByBlock: true,
        openOrderIds: ['a1b2c3d4-0000-4000-8000-000000000001'],
      },
    })
    expect(screen.getByTestId('chat-closed-banner')).toHaveTextContent(/closed/i)
    expect(screen.queryByRole('button', { name: /message about order/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a followed conversation keeps the normal composer', () => {
    renderComposer({ access: { canSendGeneral: true, closedByBlock: false, openOrderIds: [] } })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-read-only-banner')).not.toBeInTheDocument()
  })
})
