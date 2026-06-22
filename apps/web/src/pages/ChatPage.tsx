import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
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
import { PageShell } from '../components/ui/page-shell'
import { Plus, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isYesterday } from 'date-fns'
import { useChatRealtime } from '../hooks/useChatRealtime'
import { ChatConversationList } from '../components/chat/ChatConversationList'
import { ChatHeader } from '../components/chat/ChatHeader'
import { ChatThread } from '../components/chat/ChatThread'
import { ChatComposer } from '../components/chat/ChatComposer'
import { NewConversationDialog } from '../components/chat/NewConversationDialog'
import { Skeleton } from '../components/ui/skeleton'

export function ChatPage() {
  const { t } = useTranslation('chat')

  useEffect(() => {
    void ensureNamespace('chat')
  }, [])

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
  const inputRef = useRef<HTMLTextAreaElement>(null!)
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

  const conversations = useMemo(
    () => conversationsData?.conversations || [],
    [conversationsData?.conversations]
  )
  const messages = useMemo(() => messagesData?.messages || [], [messagesData?.messages])

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
    if (isYesterday(messageDate))
      return t('dates.yesterdayAt', { time: format(messageDate, 'HH:mm') })
    return format(messageDate, 'MMM d, HH:mm')
  }

  const formatConversationDate = (date: string) => {
    const convDate = new Date(date)
    if (isToday(convDate)) return format(convDate, 'HH:mm')
    if (isYesterday(convDate)) return t('dates.yesterday')
    return format(convDate, 'MMM d')
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }

  const selectConversation = useCallback(
    (id: string) => {
      setSelectedConversation(id)
      setMobileShowThread(true)
      setShowNewConversation(false)
      navigate(`/app/chat?conversation=${id}`, { replace: true })
    },
    [navigate]
  )

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
      toast.success(t('toast.conversationStarted'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string }; message?: string } }
      const msg =
        err?.data?.message || err?.data?.error?.message || t('toast.failedStartConversation')
      toast.error(typeof msg === 'string' ? msg : t('toast.failedStartConversation'))
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
        toast.error(t('toast.invalidRestaurantLink'))
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
            toast.success(t('toast.conversationCreated'))
          })
          .catch((error: { data?: { error?: { message?: string }; message?: string } }) => {
            const msg =
              error?.data?.message ||
              error?.data?.error?.message ||
              t('toast.failedCreateConversation')
            toast.error(typeof msg === 'string' ? msg : t('toast.failedCreateConversation'))
          })
      }
    }

    if (supplierId && !conversationId && user?.role === 'RESTAURANT' && !isCreatingConversation) {
      if (!uuidRe.test(supplierId)) {
        toast.error(t('toast.invalidSupplierLink'))
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
            toast.success(t('toast.conversationCreated'))
          })
          .catch((error: { data?: { error?: { message?: string }; message?: string } }) => {
            const msg =
              error?.data?.message ||
              error?.data?.error?.message ||
              t('toast.failedCreateConversation')
            toast.error(typeof msg === 'string' ? msg : t('toast.failedCreateConversation'))
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
    selectConversation,
    t,
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
      toast.success(t('toast.conversationPinned'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('toast.failedPinConversation'))
    }
  }

  const handleArchiveConversation = async () => {
    if (!selectedConversation) return
    try {
      await archiveConversation(selectedConversation).unwrap()
      setSelectedConversation(null)
      setMobileShowThread(false)
      refetchConversations()
      toast.success(t('toast.conversationArchived'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('toast.failedArchiveConversation'))
    }
  }

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return
    if (!confirm(t('toast.deleteConfirm'))) return
    try {
      await deleteConversation(selectedConversation).unwrap()
      setSelectedConversation(null)
      setMobileShowThread(false)
      refetchConversations()
      toast.success(t('toast.conversationDeleted'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('toast.failedDeleteConversation'))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('toast.fileTooLarge', { fileName: file.name }))
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
      message.trim() ||
      (selectedOrder ? t('toast.orderReferenceMessage', { id: selectedOrder.id.slice(0, 8) }) : '')
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
      toast.error(err?.data?.error?.message || t('toast.failedSendMessage'))
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
      <RequirePermission permission="CHAT_VIEW" title={t('page.permissionTitle')}>
        <PageShell data-testid="chat-page">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="flex min-h-0 gap-4 h-[calc(100dvh-11rem)] max-h-[900px]">
            <Skeleton className="hidden h-full w-80 shrink-0 rounded-xl lg:block" />
            <Skeleton className="h-full min-h-[320px] flex-1 rounded-xl" />
          </div>
        </PageShell>
      </RequirePermission>
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
      {t('page.newMessage')}
    </Button>
  ) : undefined

  return (
    <RequirePermission permission="CHAT_VIEW" title={t('page.permissionTitle')}>
      <PageShell data-testid="chat-page">
        <PageHeader
          title={t('page.title')}
          description={t('page.description')}
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
          <div className="flex min-h-0 gap-4 lg:gap-6 h-[calc(100dvh-11rem)] max-h-[900px]">
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
              className={`min-h-0 flex flex-1 flex-col overflow-hidden ${
                showThreadOnMobile || selectedConversation ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {selectedConversation && activeConv ? (
                <>
                  <ChatHeader
                    participantName={activeConv.participant_name || t('page.defaultParticipant')}
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
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                    <MessageSquare className="h-7 w-7" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">
                      {t('page.selectConversation')}
                    </p>
                    <p className="mt-1 max-w-xs text-sm text-[var(--text-mid)]">
                      {user?.role === 'SUPPLIER'
                        ? t('page.selectHintSupplier')
                        : t('page.selectHintRestaurant')}
                    </p>
                  </div>
                  {canStartConversation ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowNewConversation(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('page.newMessage')}
                    </Button>
                  ) : null}
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
      </PageShell>
    </RequirePermission>
  )
}
