import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useGetConversationsQuery, useGetMessagesQuery, useSendMessageMutation } from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAppSelector } from '../hooks/redux'
import { MessageSquare, Send, Clock, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

export function ChatPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const socketRef = useRef<any>(null)

  const { data: conversationsData, isLoading: conversationsLoading, refetch: refetchConversations } = useGetConversationsQuery()

  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages } = useGetMessagesQuery(
    { conversationId: selectedConversation! },
    { skip: !selectedConversation }
  )

  const [sendMessage, { isLoading: isSendingMessage }] = useSendMessageMutation()

  // Initialize socket
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('http://localhost:4000', {
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })

      socketRef.current.on('connect', () => {
        console.log('Socket connected')
      })

      socketRef.current.on('disconnect', () => {
        console.log('Socket disconnected')
      })

      socketRef.current.on('new_message', (data: any) => {
        console.log('New message received:', data)
        // Refetch messages to show the new message
        refetchMessages()
      })
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  // Auto-select conversation from URL params
  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId) {
      setSelectedConversation(conversationId)
    }
  }, [searchParams])

  // Join conversation when selected
  useEffect(() => {
    if (selectedConversation && socketRef.current) {
      socketRef.current.emit('join_conversation', selectedConversation)
      
      return () => {
        if (socketRef.current) {
          socketRef.current.emit('leave_conversation', selectedConversation)
        }
      }
    }
  }, [selectedConversation])

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedConversation || !socketRef.current) return
    
    try {
      // Save message to database
      await sendMessage({
        conversationId: selectedConversation,
        content: message.trim(),
      }).unwrap()
      
      // Emit socket event for real-time broadcasting
      socketRef.current.emit('send_message', {
        conversationId: selectedConversation,
        content: message.trim(),
        senderId: user?.id,
      })
      
      setMessage('')
      refetchConversations()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to send message')
    }
  }

  const conversations = conversationsData?.conversations || []
  const messages = messagesData?.messages || []

  // Debug logging
  useEffect(() => {
    console.log('Chat Page Debug:', {
      conversationsCount: conversations.length,
      conversations,
      selectedConversation,
      messagesCount: messages.length,
    })
  }, [conversations, selectedConversation, messages])

  if (conversationsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading conversations...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex gap-6 h-[calc(100vh-8rem)]">
        {/* Conversations List */}
        <Card className="w-80 flex-shrink-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Conversations
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[calc(100vh-14rem)] overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground space-y-3">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
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
                conversations.map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv.id)}
                    className={`w-full p-4 text-left hover:bg-accent transition-colors ${
                      selectedConversation === conv.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium">{conv.participant_name}</div>
                      {conv.unread_count > 0 && (
                        <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {conv.last_message_preview || 'No messages yet'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString() : 'No messages'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b">
                <CardTitle>
                  {conversations.find((c: any) => c.id === selectedConversation)?.participant_name || 'Chat'}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messagesLoading ? (
                    <div className="text-center text-muted-foreground">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-muted-foreground">No messages yet. Start the conversation!</div>
                  ) : (
                    messages.map((msg: any) => {
                      const isMyMessage = msg.sender_type === user?.role?.toUpperCase()
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-4 py-2 ${
                              isMyMessage
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <div className="text-sm">{msg.content}</div>
                            <div
                              className={`text-xs mt-1 ${
                                isMyMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              }`}
                            >
                              {new Date(msg.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Message Input */}
                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !isSendingMessage && handleSendMessage()}
                      placeholder="Type a message..."
                      className="flex-1"
                      disabled={isSendingMessage}
                    />
                    <Button onClick={handleSendMessage} disabled={!message.trim() || isSendingMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a conversation to start chatting
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
