import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useStartSupportChatMutation } from '../../services/api'
import { Button } from '../ui/button'
import { AppPanel } from '../ui/app-panel'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ensureNamespace } from '../../i18n'

export function SupportContactCard() {
  const { t } = useTranslation('settings')
  const [startSupport, { isLoading }] = useStartSupportChatMutation()
  const [conversationId, setConversationId] = useState<string | null>(null)

  useEffect(() => {
    void ensureNamespace('settings')
  }, [])

  const handleStart = async () => {
    try {
      const result = await startSupport({
        initialMessage: 'Hello, I need help with my account.',
        pageUrl: window.location.pathname,
      }).unwrap()
      const id = result?.conversation?.id
      if (id) {
        setConversationId(id)
        toast.success(t('support.toast.chatReady'))
      }
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('support.toast.startFailed'))
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
