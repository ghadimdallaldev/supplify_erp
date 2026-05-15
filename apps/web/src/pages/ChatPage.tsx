import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useGetConversationsQuery, useGetMessagesQuery, useSendMessageMutation, useCreateConversationMutation, useMarkConversationReadMutation, useGetPresignedUrlMutation, useGetOrdersQuery, usePinConversationMutation, useArchiveConversationMutation, useDeleteConversationMutation } from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAppSelector } from '../hooks/redux'
import { MessageSquare, Send, Clock, Building2, Search, X, Reply, ChevronDown, Paperclip, Image as ImageIcon, Smile, ShoppingCart, FileText, Download, Eye, Pin, PinOff, Archive, ArchiveRestore, Trash2, MoreVertical } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { format, isToday, isYesterday } from 'date-fns'
import { formatPrice } from '../utils/format'

/** Same host as API in dev (Vite proxies /api and /socket.io); explicit URL when set. */
function getChatSocketBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:4000'
}

export function ChatPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [replyingTo, setReplyingTo] = useState<any>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [showOrderPicker, setShowOrderPicker] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showConversationMenu, setShowConversationMenu] = useState(false)
  const [otherPartyTyping, setOtherPartyTyping] = useState(false)
  const socketRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: conversationsData, isLoading: conversationsLoading, refetch: refetchConversations } = useGetConversationsQuery()

  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages } = useGetMessagesQuery(
    { conversationId: selectedConversation! },
    { skip: !selectedConversation }
  )

  const [sendMessage, { isLoading: isSendingMessage }] = useSendMessageMutation()
  const [createConversation, { isLoading: isCreatingConversation }] = useCreateConversationMutation()
  const [markConversationRead] = useMarkConversationReadMutation()
  const [generatePresignedUrl, { isLoading: isUploadingFile }] = useGetPresignedUrlMutation()
  const [pinConversation] = usePinConversationMutation()
  const [archiveConversation] = useArchiveConversationMutation()
  const [deleteConversation] = useDeleteConversationMutation()
  const { data: ordersData } = useGetOrdersQuery({ limit: 100, offset: 0 }, { skip: !selectedConversation })

  const conversations = conversationsData?.conversations || []
  const messages = messagesData?.messages || []

  // Initialize socket
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(getChatSocketBaseUrl(), {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })

      socketRef.current.on('connect', () => {})

      socketRef.current.on('disconnect', () => {})

      socketRef.current.on('new_message', (_data: any) => {
        refetchMessages()
      })

      socketRef.current.on('message_read_update', (_data: any) => {
        refetchMessages()
      })

      socketRef.current.on('messages_read_update', (_data: any) => {
        refetchMessages()
      })

      socketRef.current.on('user_typing', (data: any) => {
        if (data.conversationId === selectedConversation && data.userId !== socketRef.current?.id && data.userId !== user?.id) {
          setOtherPartyTyping(data.isTyping)
        }
      })
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [refetchMessages])

  // Handle supplier query param - auto-create conversation
  useEffect(() => {
    const supplierId = searchParams.get('supplier')
    const conversationId = searchParams.get('conversation')
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Only process supplier param if we don't already have a conversation param
    if (supplierId && !conversationId && user?.role === 'RESTAURANT' && !isCreatingConversation) {
      if (!uuidRe.test(supplierId)) {
        toast.error('This supplier link is invalid. Open chat from the supplier profile.')
        navigate('/app/chat', { replace: true })
        return
      }
      // Find existing conversation with this supplier
      const existingConv = conversationsData?.conversations?.find((conv: any) => 
        conv.supplier_id === supplierId
      )
      
      if (existingConv) {
        setSelectedConversation(existingConv.id)
        // Remove supplier param from URL
        navigate(`/app/chat?conversation=${existingConv.id}`, { replace: true })
      } else if (conversationsData && !conversationsLoading) {
        // Only create if conversations are loaded (to avoid creating duplicates)
        createConversation({ supplierId })
          .unwrap()
          .then((result) => {
            setSelectedConversation(result.conversation.id)
            toast.success('Conversation created')
            // Remove supplier param and add conversation param
            navigate(`/app/chat?conversation=${result.conversation.id}`, { replace: true })
          })
          .catch((error: any) => {
            const msg =
              error?.data?.message ||
              error?.data?.error?.message ||
              error?.error ||
              'Failed to create conversation'
            toast.error(typeof msg === 'string' ? msg : 'Failed to create conversation')
          })
      }
    }
  }, [searchParams, user?.role, conversationsData, conversationsLoading, isCreatingConversation, navigate, createConversation])

  // Auto-select conversation from URL params
  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId && conversationId !== selectedConversation) {
      setSelectedConversation(conversationId)
    }
  }, [searchParams])

  // Format date helper
  const formatMessageDate = (date: string) => {
    const messageDate = new Date(date)
    if (isToday(messageDate)) {
      return format(messageDate, 'HH:mm')
    } else if (isYesterday(messageDate)) {
      return `Yesterday ${format(messageDate, 'HH:mm')}`
    } else {
      return format(messageDate, 'MMM d, HH:mm')
    }
  }

  // Format conversation date helper
  const formatConversationDate = (date: string) => {
    const convDate = new Date(date)
    if (isToday(convDate)) {
      return format(convDate, 'HH:mm')
    } else if (isYesterday(convDate)) {
      return 'Yesterday'
    } else {
      return format(convDate, 'MMM d')
    }
  }

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }

  // Check if scroll is needed
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200
      setShowScrollButton(!isNearBottom)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messages])

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      const container = messagesContainerRef.current
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 300
        if (isNearBottom) {
          setTimeout(() => scrollToBottom(), 100)
        }
      }
    }
  }, [messages])

  // Handle typing - only emit, don't show own typing indicator
  const handleTyping = () => {
    if (!selectedConversation || !socketRef.current?.connected) return

    socketRef.current.emit('typing', {
      conversationId: selectedConversation,
      isTyping: true,
    })

    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    const timeout = setTimeout(() => {
      socketRef.current?.emit('typing', {
        conversationId: selectedConversation,
        isTyping: false,
      })
    }, 2000)

    setTypingTimeout(timeout as any)
  }

  // Conversation management handlers
  const handlePinConversation = async () => {
    if (!selectedConversation) return
    try {
      await pinConversation(selectedConversation).unwrap()
      refetchConversations()
      toast.success('Conversation pinned')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to pin conversation')
    }
  }

  const handleArchiveConversation = async () => {
    if (!selectedConversation) return
    try {
      await archiveConversation(selectedConversation).unwrap()
      setSelectedConversation(null)
      refetchConversations()
      toast.success('Conversation archived')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to archive conversation')
    }
  }

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return
    if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return
    
    try {
      await deleteConversation(selectedConversation).unwrap()
      setSelectedConversation(null)
      refetchConversations()
      toast.success('Conversation deleted')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to delete conversation')
    }
  }

  // Close menu when clicking outside
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

  // Join conversation when selected and mark as read
  useEffect(() => {
    if (selectedConversation && socketRef.current?.connected) {
      socketRef.current.emit('join_conversation', selectedConversation)
      
      // Mark conversation as read when viewing
      markConversationRead(selectedConversation).catch((error: any) => {
        console.error('Failed to mark conversation as read:', error)
      })
      
      // Reset search when changing conversation
      setSearchQuery('')
      setReplyingTo(null)
      setOtherPartyTyping(false)
      setShowConversationMenu(false)
      setShowEmojiPicker(false)
      setShowOrderPicker(false)
      
      // Scroll to bottom on conversation change
      setTimeout(() => scrollToBottom(), 100)
      
      return () => {
        if (socketRef.current?.connected) {
          socketRef.current.emit('leave_conversation', selectedConversation)
        }
      }
    }
  }, [selectedConversation, markConversationRead])

  // Emoji picker - simple emoji list
  const commonEmojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾']

  const insertEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji)
    setShowEmojiPicker(false)
  }

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const validFiles = files.filter(file => {
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large (max 10MB)`)
        return false
      }
      return true
    })

    setSelectedFiles(prev => [...prev, ...validFiles])
    
    // Create previews
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setFilePreviews(prev => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      } else {
        setFilePreviews(prev => [...prev, ''])
      }
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setFilePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSendMessage = async () => {
    if ((!message.trim() && selectedFiles.length === 0 && !selectedOrder) || !selectedConversation) return
    
    const messageContent = message.trim() || (selectedOrder ? `📦 Order #${selectedOrder.id.slice(0, 8)}` : '')
    const replyToId = replyingTo?.id || null
    
    try {
      const attachments: any[] = []

      // Upload files if any
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            const presignedResponse = await generatePresignedUrl({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }).unwrap()

            // Upload to S3/MinIO
            const uploadResponse = await fetch(presignedResponse.url, {
              method: 'PUT',
              body: file,
              headers: {
                'Content-Type': file.type,
              },
            })

            if (!uploadResponse.ok) {
              throw new Error('Failed to upload file')
            }

            const fileUrl = presignedResponse.url.split('?')[0]
            attachments.push({
              fileUrl,
              fileType: file.type,
              fileName: file.name,
              fileSize: file.size,
            })
          } catch (error: any) {
            toast.error(`Failed to upload ${file.name}`)
          }
        }
      }

      // Save message to database (server will emit new_message so other clients refetch)
      await sendMessage({
        conversationId: selectedConversation,
        content: messageContent,
        replyTo: replyToId || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        orderId: selectedOrder?.id || undefined,
        messageType: selectedOrder ? 'ORDER_REFERENCE' : undefined,
      }).unwrap()
      
      // Stop typing indicator
      if (typingTimeout) {
        clearTimeout(typingTimeout)
      }
      socketRef.current?.emit('typing', {
        conversationId: selectedConversation,
        isTyping: false,
      })
      
      setMessage('')
      setReplyingTo(null)
      setSelectedFiles([])
      setFilePreviews([])
      setSelectedOrder(null)
      // Refetch messages and conversations so UI shows persisted message immediately
      await Promise.all([refetchMessages(), refetchConversations()])
      
      // Scroll to bottom after sending
      setTimeout(() => scrollToBottom(), 100)
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send message')
    }
  }

  // Filter messages by search query
  const filteredMessages = searchQuery
    ? messages.filter((msg: any) =>
        msg.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages

  // Group messages by date
  const groupedMessages = filteredMessages.reduce((groups: any[], msg: any) => {
    const date = new Date(msg.created_at).toDateString()
    const lastGroup = groups[groups.length - 1]
    
    if (!lastGroup || lastGroup.date !== date) {
      groups.push({
        date,
        messages: [msg],
      })
    } else {
      lastGroup.messages.push(msg)
    }
    
    return groups
  }, [])

  if (conversationsLoading || isCreatingConversation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">
          {isCreatingConversation ? 'Creating conversation...' : 'Loading conversations...'}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex gap-6 h-[calc(100vh-8rem)] min-h-0">
        {/* Conversations List */}
        <Card className="w-80 flex-shrink-0 flex flex-col min-h-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Conversations
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div className="divide-y max-h-[calc(100vh-14rem)] overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-sm text-[var(--text-muted)] space-y-3">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 text-[var(--text-muted)]/50" />
                  <p className="font-medium">No conversations yet</p>
                  {user?.role === 'RESTAURANT' && (
                    <>
                      <p className="text-xs">Browse suppliers and click "Message" to start chatting</p>
                      <Link to="/app/suppliers">
                        <Button variant="outline" size="sm" className="mt-2">
                          <Building2 className="h-4 w-4 mr-2" />
                          Browse Suppliers
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              ) : (
                [...conversations].sort((a: any, b: any) => {
                  // Pinned conversations first
                  if (a.is_pinned && !b.is_pinned) return -1
                  if (!a.is_pinned && b.is_pinned) return 1
                  return 0
                }).map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv.id)}
                    className={`w-full p-4 text-left hover:bg-accent transition-colors border-l-2 ${
                      selectedConversation === conv.id 
                        ? 'bg-accent border-l-primary' 
                        : conv.is_pinned 
                          ? 'border-l-[var(--brand-mid)] bg-[var(--brand-ultra)]/50 dark:bg-[var(--brand)]/20' 
                          : 'border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-medium">
                        {conv.is_pinned && (
                          <Pin className="h-3 w-3 text-[var(--brand-mid)] dark:text-[var(--brand-light)] fill-current" />
                        )}
                        {conv.participant_name}
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] text-white text-xs rounded-full px-2 py-0.5 font-semibold shadow-sm">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-[var(--text-muted)] truncate">
                      {conv.last_message_preview || 'No messages yet'}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">
                      {conv.last_message_at ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatConversationDate(conv.last_message_at)}
                        </span>
                      ) : (
                        <span>No messages</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col min-h-0">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b bg-gradient-to-r from-[var(--brand-ultra)]/50 to-[var(--brand-pale)]/50 dark:from-[var(--brand)]/50 dark:to-[var(--text)]/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="flex items-center gap-2">
                      {conversations.find((c: any) => c.id === selectedConversation)?.is_pinned && (
                        <Pin className="h-4 w-4 text-[var(--brand-mid)] dark:text-[var(--brand-light)] fill-current" />
                      )}
                      {conversations.find((c: any) => c.id === selectedConversation)?.participant_name || 'Chat'}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                      <Input
                        placeholder="Search messages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 w-48 h-8"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        >
                            <X className="h-4 w-4 text-[var(--text-muted)]" />
                          </button>
                      )}
                    </div>
                    <div className="relative conversation-menu-container">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowConversationMenu(!showConversationMenu)}
                        className="h-8 w-8 p-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {showConversationMenu && (
                        <div className="absolute right-0 top-10 z-50 w-48 bg-background border rounded-lg shadow-xl p-1 border-[var(--app-border)] dark:border-[var(--app-border-mid)]">
                          <button
                            onClick={() => {
                              handlePinConversation()
                              setShowConversationMenu(false)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-[var(--brand-ultra)] text-sm transition-colors"
                          >
                            {conversations.find((c: any) => c.id === selectedConversation)?.is_pinned ? (
                              <>
                                <PinOff className="h-4 w-4" />
                                Unpin
                              </>
                            ) : (
                              <>
                                <Pin className="h-4 w-4" />
                                Pin
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              handleArchiveConversation()
                              setShowConversationMenu(false)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-[var(--brand-ultra)] text-sm transition-colors"
                          >
                            <Archive className="h-4 w-4" />
                            Archive
                          </button>
                          <div className="border-t my-1" />
                          <button
                            onClick={() => {
                              handleDeleteConversation()
                              setShowConversationMenu(false)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-destructive/10 text-destructive text-sm transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-0 relative min-h-0">
                {/* Messages */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
                >
                  {messagesLoading ? (
                    <div className="text-center text-[var(--text-muted)]">Loading messages...</div>
                  ) : filteredMessages.length === 0 ? (
                    <div className="text-center text-[var(--text-muted)]">
                      {searchQuery ? 'No messages found' : 'No messages yet. Start the conversation!'}
                    </div>
                  ) : (
                    <>
                      {groupedMessages.map((group: any, groupIndex: number) => (
                        <div key={group.date}>
                          {/* Date Separator */}
                          <div className="flex items-center justify-center my-6">
                            <div className="bg-gradient-to-r from-[var(--brand-ultra)] to-[var(--brand-pale)] dark:from-[var(--brand)] dark:to-[var(--text)] px-4 py-1.5 rounded-full text-xs font-medium text-[var(--brand-mid)] dark:text-[var(--brand-light)] shadow-sm border border-[var(--app-border)] dark:border-[var(--brand)]">
                              {isToday(new Date(group.date)) ? '📅 Today' : isYesterday(new Date(group.date)) ? '📅 Yesterday' : `📅 ${format(new Date(group.date), 'MMMM d, yyyy')}`}
                            </div>
                          </div>
                          
                          {group.messages.map((msg: any, msgIndex: number) => {
                            const isMyMessage = msg.sender_type === user?.role?.toUpperCase()
                            const prevMsg = msgIndex > 0 ? group.messages[msgIndex - 1] : null
                            const showSender = !prevMsg || prevMsg.sender_id !== msg.sender_id || 
                              new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 300000 // 5 minutes
                            
                            return (
                              <div
                                key={msg.id}
                                className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} mb-1`}
                              >
                                <div className={`max-w-[75%] ${isMyMessage ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                                  {replyingTo?.id === msg.id && (
                                    <div className="text-xs text-[var(--text-muted)] mb-1 px-2">
                                      Replying to: {msg.content.substring(0, 50)}...
                                    </div>
                                  )}
                                  <div
                                    className={`rounded-2xl px-4 py-2.5 shadow-md transition-all hover:shadow-lg backdrop-blur-sm ${
                                      isMyMessage
                                        ? 'bg-gradient-to-br from-[var(--brand)] to-[var(--brand-mid)] text-white border border-white/20 shadow-md'
                                        : 'bg-gradient-to-br from-[var(--surface)] via-[var(--brand-ultra)] to-[var(--brand-ultra)] text-[var(--text)] border border-[var(--app-border)] shadow-sm'
                                    }`}
                                  >
                                    {msg.reply_to && msg.reply_to_content && (
                                      <div className={`text-xs mb-1 pb-1 border-b ${isMyMessage ? 'border-white/20' : 'border-[var(--app-border)]'} opacity-70`}>
                                        <div className="flex items-start gap-1">
                                          <Reply className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium">
                                              {msg.reply_to_sender_type === user?.role?.toUpperCase() ? 'You' : 
                                               msg.reply_to_supplier_name || msg.reply_to_restaurant_name || 'User'}
                                            </div>
                                            <div className="truncate">{msg.reply_to_content}</div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Order Details */}
                                    {msg.order_id && (
                                      <div className={`mb-2 p-3 rounded-lg border-2 ${
                                        isMyMessage 
                                          ? 'bg-white/10 border-white/20' 
                                          : 'bg-[var(--brand-ultra)] dark:bg-[var(--text)] border-[var(--app-border-mid)] dark:border-[var(--app-border-mid)]'
                                      }`}>
                                        <div className="flex items-center gap-2 mb-2">
                                          <ShoppingCart className={`h-4 w-4 ${isMyMessage ? 'text-white' : 'text-[var(--brand-mid)]'}`} />
                                          <span className={`font-semibold text-sm ${isMyMessage ? 'text-white' : 'text-[var(--text)]'}`}>
                                            Order Reference
                                          </span>
                                        </div>
                                        <div className={`text-xs ${isMyMessage ? 'text-white/90' : 'text-[var(--text-muted)] dark:text-[var(--text-muted)]'}`}>
                                          Order ID: {msg.order_id.slice(0, 8)}...
                                        </div>
                                        {ordersData?.orders?.find((o: any) => o.id === msg.order_id) && (
                                          <Link 
                                            to={`/app/orders/${msg.order_id}`}
                                            className="text-xs mt-1 inline-flex items-center gap-1 underline"
                                          >
                                            <Eye className="h-3 w-3" />
                                            View Order Details
                                          </Link>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Attachments */}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                      <div className="mb-2 space-y-2">
                                        {msg.attachments.map((att: any, attIndex: number) => (
                                          <div key={att.id || attIndex} className="rounded-lg overflow-hidden">
                                            {att.fileType?.startsWith('image/') ? (
                                              <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                                                <img 
                                                  src={att.fileUrl} 
                                                  alt={att.fileName || 'Attachment'} 
                                                  className="max-w-full h-auto max-h-64 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                />
                                              </a>
                                            ) : (
                                              <a 
                                                href={att.fileUrl} 
                                                download={att.fileName}
                                                className={`flex items-center gap-2 p-2 rounded-lg border ${
                                                  isMyMessage 
                                                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' 
                                                    : 'bg-[var(--brand-ultra)] border-[var(--app-border-mid)] hover:bg-[var(--brand-pale)]'
                                                } transition-colors`}
                                              >
                                                <FileText className="h-4 w-4" />
                                                <span className="text-sm truncate">{att.fileName}</span>
                                                <Download className="h-3 w-3 ml-auto" />
                                              </a>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    <div className="text-sm break-words whitespace-pre-wrap">{msg.content}</div>
                                    <div
                                      className={`text-xs mt-1 flex items-center gap-1 ${
                                        isMyMessage ? 'text-white/70' : 'text-[var(--text-muted)]'
                                      }`}
                                    >
                                      <span>{formatMessageDate(msg.created_at)}</span>
                                      {isMyMessage && (
                                        <span className="ml-1">
                                          {msg.is_read ? (
                                            <span className="text-[var(--brand-light)]">✓✓</span>
                                          ) : (
                                            <span className="text-white/50">✓</span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {!isMyMessage && (
                                    <button
                                      onClick={() => setReplyingTo(msg)}
                                      className="text-xs text-[var(--text-muted)] mt-1 px-2 hover:text-foreground"
                                    >
                                      Reply
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                      
                      {/* Typing Indicator - Only show when OTHER party is typing */}
                      {otherPartyTyping && (
                        <div className="flex justify-start mb-2">
                          <div className="bg-gradient-to-br from-[var(--brand-ultra)] to-[var(--app-border-mid)] rounded-2xl px-4 py-2.5 shadow-sm border border-[var(--app-border)]">
                            <div className="flex gap-1.5 items-center">
                              <span className="text-base">✍️</span>
                              <div className="w-2 h-2 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-2 h-2 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-2 h-2 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              <span className="text-xs text-[var(--text-muted)] ml-2">typing...</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Scroll to Bottom Button */}
                {showScrollButton && (
                  <Button
                    onClick={scrollToBottom}
                    size="sm"
                    className="absolute bottom-20 right-6 rounded-full h-10 w-10 p-0 shadow-lg"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                )}

                {/* Reply Preview */}
                {replyingTo && (
                  <div className="border-t px-4 py-2 bg-[var(--brand-ultra)]/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Reply className="h-4 w-4 text-[var(--text-muted)]" />
                      <span className="text-[var(--text-muted)]">Replying to:</span>
                      <span className="truncate max-w-xs">{replyingTo.content}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReplyingTo(null)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* File/Order Previews */}
                {(selectedFiles.length > 0 || selectedOrder) && (
                  <div className="border-t px-4 py-3 bg-[var(--brand-ultra)]/30 space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-background rounded-lg border">
                        {filePreviews[index] ? (
                          <img src={filePreviews[index]} alt={file.name} className="h-12 w-12 rounded object-cover" />
                        ) : (
                          <div className="h-12 w-12 rounded bg-[var(--brand-ultra)] flex items-center justify-center">
                            <FileText className="h-6 w-6 text-[var(--text-muted)]" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{file.name}</div>
                          <div className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {selectedOrder && (
                      <div className="flex items-center gap-2 p-2 bg-background rounded-lg border">
                        <ShoppingCart className="h-5 w-5 text-[var(--brand-mid)]" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">Order #{selectedOrder.id.slice(0, 8)}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {selectedOrder.total_amount ? formatPrice(selectedOrder.total_amount) : 'View details'}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedOrder(null)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Message Input */}
                <div className="border-t p-4 bg-gradient-to-t from-background to-background/95">
                  {/* Emoji Picker */}
                  {showEmojiPicker && (
                    <div className="emoji-picker-container mb-3 p-3 bg-background border rounded-lg shadow-xl max-h-48 overflow-y-auto border-[var(--app-border)] dark:border-[var(--app-border-mid)]">
                      <div className="grid grid-cols-8 gap-1">
                        {commonEmojis.map((emoji, index) => (
                          <button
                            key={index}
                            onClick={() => insertEmoji(emoji)}
                            className="text-2xl hover:scale-125 transition-transform p-1 rounded hover:bg-[var(--brand-ultra)]"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2 items-end">
                    <div className="flex gap-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.doc,.docx"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-9 w-9 p-0"
                        title="Attach file"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="h-9 w-9 p-0"
                        title="Add emoji"
                      >
                        <Smile className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowOrderPicker(!showOrderPicker)}
                        className="h-9 w-9 p-0"
                        title="Attach order"
                        disabled={!ordersData?.orders?.length}
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      ref={inputRef}
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value)
                        handleTyping()
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isSendingMessage) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder={replyingTo ? `Reply to ${replyingTo.sender_type === user?.role?.toUpperCase() ? 'yourself' : 'message'}...` : "Type a message..."}
                      className="flex-1 min-h-[36px]"
                      disabled={isSendingMessage || isUploadingFile}
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={(!message.trim() && selectedFiles.length === 0 && !selectedOrder) || isSendingMessage || isUploadingFile}
                      className="h-9 px-4 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] hover:opacity-90 text-white shadow-md"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Order Picker */}
                  {showOrderPicker && ordersData?.orders && (
                    <div className="order-picker-container mt-2 p-3 bg-background border rounded-lg shadow-xl max-h-48 overflow-y-auto border-[var(--app-border)] dark:border-[var(--app-border-mid)]">
                      <div className="text-xs font-medium mb-2 text-[var(--text-muted)]">Select an order to share:</div>
                      <div className="space-y-1">
                        {ordersData.orders.slice(0, 5).map((order: any) => (
                          <button
                            key={order.id}
                            onClick={() => {
                              setSelectedOrder(order)
                              setShowOrderPicker(false)
                            }}
                            className="w-full text-left p-2 rounded hover:bg-[var(--brand-ultra)] transition-colors text-sm"
                          >
                            <div className="font-medium">Order #{order.id.slice(0, 8)}</div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {order.total_amount ? formatPrice(order.total_amount) : 'No amount'} • {order.status}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              Select a conversation to start chatting
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
