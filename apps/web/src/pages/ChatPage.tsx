import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useGetConversationsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useCreateConversationMutation,
  useMarkConversationReadMutation,
  useGetPresignedUrlMutation,
  useGetOrdersQuery,
  usePinConversationMutation,
  useArchiveConversationMutation,
  useDeleteConversationMutation,
} from '../services/api'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isYesterday } from 'date-fns'
import { useChatRealtime } from '../hooks/useChatRealtime'
import { ChatConversationList } from '../components/chat/ChatConversationList'
import { ChatHeader } from '../components/chat/ChatHeader'
import { ChatThread } from '../components/chat/ChatThread'
import { ChatComposer } from '../components/chat/ChatComposer'
import { NewConversationDialog } from '../components/chat/NewConversationDialog'

export function ChatPage() {
  const { user } = useAppSelector((state) => state.auth)
  const { canAny } = usePermissions()
  const canSendMessages = canAny('CHAT_SEND', 'CHAT_MANAGE')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [listFilter, setListFilter] = useState('')
  const [message, setMessage] = useState('')
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Record<string, unknown> | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [showOrderPicker, setShowOrderPicker] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string
    total_amount?: number
    status?: string
  } | null>(null)
  const [showConversationMenu, setShowConversationMenu] = useState(false)
  const [otherPartyTyping, setOtherPartyTyping] = useState(false)
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [showNewConversation, setShowNewConversation] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null!)
  const messagesContainerRef = useRef<HTMLDivElement>(null!)
  const inputRef = useRef<HTMLInputElement>(null!)
  const fileInputRef = useRef<HTMLInputElement>(null!)

  const {
    data: conversationsData,
    isLoading: conversationsLoading,
    refetch: refetchConversations,
  } = useGetConversationsQuery()

  const { data: messagesData, isLoading: messagesLoading } = useGetMessagesQuery(
    { conversationId: selectedConversation! },
    { skip: !selectedConversation }
  )

  const [sendMessage, { isLoading: isSendingMessage }] = useSendMessageMutation()
  const [createConversation, { isLoading: isCreatingConversation }] =
    useCreateConversationMutation()
  const [markConversationRead] = useMarkConversationReadMutation()
  const [generatePresignedUrl, { isLoading: isUploadingFile }] = useGetPresignedUrlMutation()
  const [pinConversation] = usePinConversationMutation()
  const [archiveConversation] = useArchiveConversationMutation()
  const [deleteConversation] = useDeleteConversationMutation()
  const { data: ordersData } = useGetOrdersQuery(
    { limit: 100, offset: 0 },
    { skip: !selectedConversation }
  )

  const conversations = conversationsData?.conversations || []
  const messages = messagesData?.messages || []

  const handleTypingChange = useCallback((typing: boolean) => {
    setOtherPartyTyping(typing)
  }, [])

  const { connected, emitTyping } = useChatRealtime({
    userId: user?.id,
    selectedConversationId: selectedConversation,
    onOtherPartyTyping: handleTypingChange,
  })

  const formatMessageDate = (date: string) => {
    const messageDate = new Date(date)
    if (isToday(messageDate)) return format(messageDate, 'HH:mm')
    if (isYesterday(messageDate)) return `Yesterday ${format(messageDate, 'HH:mm')}`
    return format(messageDate, 'MMM d, HH:mm')
  }

  const formatConversationDate = (date: string) => {
    const convDate = new Date(date)
    if (isToday(convDate)) return format(convDate, 'HH:mm')
    if (isYesterday(convDate)) return 'Yesterday'
    return format(convDate, 'MMM d')
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }

  const selectConversation = (id: string) => {
    setSelectedConversation(id)
    setMobileShowThread(true)
    setShowNewConversation(false)
    navigate(`/app/chat?conversation=${id}`, { replace: true })
  }

  const handleStartConversation = async (participantId: string) => {
    const isSupplier = user?.role === 'SUPPLIER'
    const existingConv = conversations.find(
      (conv: { supplier_id?: string; restaurant_id?: string }) =>
        isSupplier ? conv.restaurant_id === participantId : conv.supplier_id === participantId
    )
    if (existingConv) {
      selectConversation(existingConv.id)
      return
    }

    try {
      const result = await createConversation(
        isSupplier ? { restaurantId: participantId } : { supplierId: participantId }
      ).unwrap()
      selectConversation(result.conversation.id)
      toast.success('Conversation started')
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string }; message?: string } }
      const msg = err?.data?.message || err?.data?.error?.message || 'Failed to start conversation'
      toast.error(typeof msg === 'string' ? msg : 'Failed to start conversation')
    }
  }

  const handleTyping = () => {
    if (!selectedConversation) return
    emitTyping(selectedConversation, true)
    if (typingTimeout) clearTimeout(typingTimeout)
    const timeout = setTimeout(() => {
      emitTyping(selectedConversation, false)
    }, 2000)
    setTypingTimeout(timeout)
  }

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      setShowScrollButton(scrollHeight - scrollTop - clientHeight >= 200)
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messages])

  useEffect(() => {
    if (messages.length > 0) {
      const container = messagesContainerRef.current
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container
        if (scrollHeight - scrollTop - clientHeight < 300) {
          setTimeout(() => scrollToBottom(), 100)
        }
      }
    }
  }, [messages])

  useEffect(() => {
    if (!selectedConversation) return
    markConversationRead(selectedConversation).catch(() => {})
    setSearchQuery('')
    setReplyingTo(null)
    setOtherPartyTyping(false)
    setShowConversationMenu(false)
    setShowEmojiPicker(false)
    setShowOrderPicker(false)
    setTimeout(() => scrollToBottom(), 100)
  }, [selectedConversation, markConversationRead])

  useEffect(() => {
    const supplierId = searchParams.get('supplier')
    const conversationId = searchParams.get('conversation')
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    const restaurantId = searchParams.get('restaurant')

    if (restaurantId && !conversationId && user?.role === 'SUPPLIER' && !isCreatingConversation) {
      if (!uuidRe.test(restaurantId)) {
        toast.error('This restaurant link is invalid. Open chat from the restaurant profile.')
        navigate('/app/chat', { replace: true })
        return
      }
      const existingConv = conversations.find(
        (conv: { restaurant_id?: string }) => conv.restaurant_id === restaurantId
      )
      if (existingConv) {
        selectConversation(existingConv.id)
      } else if (conversationsData && !conversationsLoading) {
        createConversation({ restaurantId })
          .unwrap()
          .then((result) => {
            selectConversation(result.conversation.id)
            toast.success('Conversation created')
          })
          .catch((error: { data?: { error?: { message?: string }; message?: string } }) => {
            const msg =
              error?.data?.message || error?.data?.error?.message || 'Failed to create conversation'
            toast.error(typeof msg === 'string' ? msg : 'Failed to create conversation')
          })
      }
    }

    if (supplierId && !conversationId && user?.role === 'RESTAURANT' && !isCreatingConversation) {
      if (!uuidRe.test(supplierId)) {
        toast.error('This supplier link is invalid. Open chat from the supplier profile.')
        navigate('/app/chat', { replace: true })
        return
      }
      const existingConv = conversations.find(
        (conv: { supplier_id?: string }) => conv.supplier_id === supplierId
      )
      if (existingConv) {
        selectConversation(existingConv.id)
      } else if (conversationsData && !conversationsLoading) {
        createConversation({ supplierId })
          .unwrap()
          .then((result) => {
            selectConversation(result.conversation.id)
            toast.success('Conversation created')
          })
          .catch((error: { data?: { error?: { message?: string }; message?: string } }) => {
            const msg =
              error?.data?.message || error?.data?.error?.message || 'Failed to create conversation'
            toast.error(typeof msg === 'string' ? msg : 'Failed to create conversation')
          })
      }
    }
  }, [
    searchParams,
    user?.role,
    conversationsData,
    conversationsLoading,
    isCreatingConversation,
    navigate,
    createConversation,
    conversations,
  ])

  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId && conversationId !== selectedConversation) {
      setSelectedConversation(conversationId)
      setMobileShowThread(true)
    }
  }, [searchParams, selectedConversation])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showConversationMenu && !target.closest('.conversation-menu-container')) {
        setShowConversationMenu(false)
      }
      if (showEmojiPicker && !target.closest('.emoji-picker-container')) {
        setShowEmojiPicker(false)
      }
      if (showOrderPicker && !target.closest('.order-picker-container')) {
        setShowOrderPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showConversationMenu, showEmojiPicker, showOrderPicker])

  const handlePinConversation = async () => {
    if (!selectedConversation) return
    try {
      await pinConversation(selectedConversation).unwrap()
      refetchConversations()
      toast.success('Conversation pinned')
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to pin conversation')
    }
  }

  const handleArchiveConversation = async () => {
    if (!selectedConversation) return
    try {
      await archiveConversation(selectedConversation).unwrap()
      setSelectedConversation(null)
      setMobileShowThread(false)
      refetchConversations()
      toast.success('Conversation archived')
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to archive conversation')
    }
  }

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return
    if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.'))
      return
    try {
      await deleteConversation(selectedConversation).unwrap()
      setSelectedConversation(null)
      setMobileShowThread(false)
      refetchConversations()
      toast.success('Conversation deleted')
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to delete conversation')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10MB)`)
        return false
      }
      return true
    })
    setSelectedFiles((prev) => [...prev, ...validFiles])
    validFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => setFilePreviews((prev) => [...prev, reader.result as string])
        reader.readAsDataURL(file)
      } else {
        setFilePreviews((prev) => [...prev, ''])
      }
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSendMessage = async () => {
    if ((!message.trim() && selectedFiles.length === 0 && !selectedOrder) || !selectedConversation)
      return

    const messageContent =
      message.trim() || (selectedOrder ? `📦 Order #${selectedOrder.id.slice(0, 8)}` : '')
    const replyToId = replyingTo?.id ? String(replyingTo.id) : undefined

    try {
      const attachments: Array<{
        fileUrl: string
        fileType: string
        fileName: string
        fileSize: number
      }> = []

      for (const file of selectedFiles) {
        const presignedResponse = await generatePresignedUrl({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }).unwrap()
        const uploadUrl =
          presignedResponse.presignedUrl || (presignedResponse as { url?: string }).url
        if (!uploadUrl) throw new Error('Missing upload URL from server')
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!uploadResponse.ok) throw new Error('Failed to upload file')
        const fileUrl = presignedResponse.publicUrl || uploadUrl.split('?')[0]
        attachments.push({
          fileUrl,
          fileType: file.type,
          fileName: file.name,
          fileSize: file.size,
        })
      }

      await sendMessage({
        conversationId: selectedConversation,
        content: messageContent,
        replyTo: replyToId,
        attachments: attachments.length > 0 ? attachments : undefined,
        orderId: selectedOrder?.id,
        messageType: selectedOrder ? 'ORDER_REFERENCE' : undefined,
      }).unwrap()

      if (typingTimeout) clearTimeout(typingTimeout)
      emitTyping(selectedConversation, false)

      setMessage('')
      setReplyingTo(null)
      setSelectedFiles([])
      setFilePreviews([])
      setSelectedOrder(null)
      setTimeout(() => scrollToBottom(), 100)
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to send message')
    }
  }

  const filteredMessages = searchQuery
    ? messages.filter((msg: { content?: string }) =>
        String(msg.content || '')
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : messages

  const groupedMessages = filteredMessages.reduce(
    (groups: { date: string; messages: unknown[] }[], msg: { created_at?: string }) => {
      const date = new Date(String(msg.created_at)).toDateString()
      const lastGroup = groups[groups.length - 1]
      if (!lastGroup || lastGroup.date !== date) {
        groups.push({ date, messages: [msg] })
      } else {
        lastGroup.messages.push(msg)
      }
      return groups
    },
    []
  )

  const activeConv = conversations.find((c: { id: string }) => c.id === selectedConversation)

  if (conversationsLoading || isCreatingConversation) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-lg">
          {isCreatingConversation ? 'Creating conversation…' : 'Loading conversations…'}
        </div>
      </div>
    )
  }

  const showListOnMobile = !mobileShowThread || !selectedConversation
  const showThreadOnMobile = mobileShowThread && selectedConversation
  const canStartConversation =
    (user?.role === 'RESTAURANT' || user?.role === 'SUPPLIER') && canSendMessages
  const hasConversations = conversations.length > 0

  const newMessageAction = canStartConversation ? (
    <Button size="sm" onClick={() => setShowNewConversation(true)}>
      <Plus className="mr-2 h-4 w-4" />
      New message
    </Button>
  ) : undefined

  return (
    <RequirePermission permission="CHAT_VIEW" title="chat">
      <div className="container mx-auto flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          title="Messages"
          description="Chat with suppliers and restaurants in real time."
          actions={newMessageAction}
        />

        {!hasConversations ? (
          <div className="mx-auto w-full max-w-md">
            <ChatConversationList
              conversations={conversations}
              selectedConversationId={selectedConversation}
              onSelect={selectConversation}
              listFilter={listFilter}
              onListFilterChange={setListFilter}
              userRole={user?.role}
              formatConversationDate={formatConversationDate}
              onNewMessage={canStartConversation ? () => setShowNewConversation(true) : undefined}
            />
          </div>
        ) : (
          <div className="flex min-h-0 gap-4 lg:gap-6 h-[calc(100vh-11rem)] max-h-[900px]">
            <div
              className={`min-h-0 w-full shrink-0 lg:block lg:w-80 ${
                showListOnMobile ? 'block' : 'hidden'
              } ${showThreadOnMobile ? 'lg:block' : ''}`}
            >
              <ChatConversationList
                conversations={conversations}
                selectedConversationId={selectedConversation}
                onSelect={selectConversation}
                listFilter={listFilter}
                onListFilterChange={setListFilter}
                userRole={user?.role}
                formatConversationDate={formatConversationDate}
                onNewMessage={canStartConversation ? () => setShowNewConversation(true) : undefined}
                className="h-full"
              />
            </div>

            <Card
              className={`min-h-0 flex flex-1 flex-col ${
                showThreadOnMobile || selectedConversation ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {selectedConversation && activeConv ? (
                <>
                  <ChatHeader
                    participantName={activeConv.participant_name || 'Chat'}
                    isPinned={activeConv.is_pinned}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    showMenu={showConversationMenu}
                    onToggleMenu={() => setShowConversationMenu((v) => !v)}
                    onPin={handlePinConversation}
                    onArchive={handleArchiveConversation}
                    onDelete={handleDeleteConversation}
                    onBack={() => {
                      setMobileShowThread(false)
                      navigate('/app/chat', { replace: true })
                    }}
                    connected={connected}
                    otherPartyTyping={otherPartyTyping}
                  />
                  <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                    <ChatThread
                      messagesLoading={messagesLoading}
                      groupedMessages={groupedMessages}
                      searchQuery={searchQuery}
                      userRole={user?.role}
                      onReply={setReplyingTo}
                      otherPartyTyping={otherPartyTyping}
                      formatMessageDate={formatMessageDate}
                      messagesContainerRef={messagesContainerRef}
                      messagesEndRef={messagesEndRef}
                      showScrollButton={showScrollButton}
                      onScrollToBottom={scrollToBottom}
                    />
                    <ChatComposer
                      canSend={canSendMessages}
                      message={message}
                      onMessageChange={setMessage}
                      onSend={handleSendMessage}
                      onTyping={handleTyping}
                      isSending={isSendingMessage}
                      isUploading={isUploadingFile}
                      replyingTo={replyingTo}
                      onClearReply={() => setReplyingTo(null)}
                      showEmojiPicker={showEmojiPicker}
                      onToggleEmojiPicker={() => setShowEmojiPicker((v) => !v)}
                      onInsertEmoji={(emoji) => {
                        setMessage((prev) => prev + emoji)
                        setShowEmojiPicker(false)
                      }}
                      showOrderPicker={showOrderPicker}
                      onToggleOrderPicker={() => setShowOrderPicker((v) => !v)}
                      orders={ordersData?.orders || []}
                      selectedOrder={selectedOrder}
                      onSelectOrder={(order) => {
                        setSelectedOrder(order)
                        setShowOrderPicker(false)
                      }}
                      onClearOrder={() => setSelectedOrder(null)}
                      selectedFiles={selectedFiles}
                      filePreviews={filePreviews}
                      onFileSelect={handleFileSelect}
                      onRemoveFile={(index) => {
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
                        setFilePreviews((prev) => prev.filter((_, i) => i !== index))
                      }}
                      fileInputRef={fileInputRef}
                      inputRef={inputRef}
                      userRole={user?.role}
                    />
                  </CardContent>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-[var(--text-muted)]">
                  <p className="text-sm font-medium">Select a conversation</p>
                  <p className="text-xs max-w-xs">
                    {user?.role === 'SUPPLIER'
                      ? 'Pick a restaurant from the list or start a new message.'
                      : 'Choose someone from the list to view messages.'}
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}

        <NewConversationDialog
          open={showNewConversation}
          onOpenChange={setShowNewConversation}
          userRole={user?.role}
          onSelectParticipant={handleStartConversation}
          isCreating={isCreatingConversation}
        />
      </div>
    </RequirePermission>
  )
}
