import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStartSupportChatMutation } from '../../services/api'
import { Button } from '../ui/button'
import { AppPanel } from '../ui/app-panel'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function SupportContactCard() {
  const [startSupport, { isLoading }] = useStartSupportChatMutation()
  const [conversationId, setConversationId] = useState<string | null>(null)

  const handleStart = async () => {
    try {
      const result = await startSupport({
        initialMessage: 'Hello, I need help with my account.',
        pageUrl: window.location.pathname,
      }).unwrap()
      const id = result?.conversation?.id
      if (id) {
        setConversationId(id)
        toast.success('Support chat ready')
      }
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Could not start support chat')
    }
  }

  return (
    <AppPanel
      title="Contact support"
      description="Chat with Supplify support about billing, features, or issues"
    >
      <div className="flex flex-wrap gap-2">
        {conversationId ? (
          <Button asChild>
            <Link to={`/app/chat?conversation=${conversationId}&support=1`}>Open support chat</Link>
          </Button>
        ) : (
          <Button onClick={handleStart} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Start support chat
          </Button>
        )}
      </div>
    </AppPanel>
  )
}
