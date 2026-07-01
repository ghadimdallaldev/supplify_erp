import { useEffect, useState } from 'react'
import { Webhook, Loader2, Save, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Info } from 'lucide-react'
import {
  useGetNotificationWebhookQuery,
  useUpdateNotificationWebhookMutation,
} from '../../services/api'
import { useEntitlements } from '../../hooks/useEntitlements'

const CHANNELS_BY_PLAN: Record<string, string[]> = {
  in_app_only: ['In-app'],
  in_app_and_email: ['In-app', 'Email'],
  email_and_whatsapp: ['In-app', 'Email', 'WhatsApp'],
  email_whatsapp_webhook: ['In-app', 'Email', 'WhatsApp', 'Webhook'],
}

/**
 * Informational notice showing which delivery channels the current plan supports.
 * Makes it clear that email / WhatsApp toggles only take effect on included channels
 * (the server silently drops channels the plan does not cover).
 */
export function NotificationChannelPlanNotice() {
  const { entitlements } = useEntitlements()
  const value = entitlements?.features?.notifications
  const planValue = typeof value === 'string' ? value : 'in_app_only'
  const channels = CHANNELS_BY_PLAN[planValue] ?? CHANNELS_BY_PLAN.in_app_only
  const hasAll = planValue === 'email_whatsapp_webhook'

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/40 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      <div className="text-sm text-[var(--text-mid)]">
        <p>
          Your plan delivers notifications via:{' '}
          <span className="font-medium text-[var(--text)]">{channels.join(', ')}</span>.
        </p>
        {!hasAll ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Toggles for channels not included in your plan won&rsquo;t take effect until you
            upgrade.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Outbound notification webhook configuration (Platinum "email_whatsapp_webhook" tier).
 * The backend reports `allowed` based on the tenant plan, so this card stays
 * self-contained and safe to mount in any settings surface.
 */
export function NotificationWebhookCard() {
  const { data, isLoading } = useGetNotificationWebhookQuery()
  const [saveWebhook, { isLoading: isSaving }] = useUpdateNotificationWebhookMutation()

  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (data?.webhook) {
      setUrl(data.webhook.url)
      setEnabled(data.webhook.enabled)
    }
  }, [data?.webhook])

  if (isLoading) {
    return null
  }

  const allowed = Boolean(data?.allowed)

  const handleSave = async () => {
    const trimmed = url.trim()
    if (!/^https:\/\//i.test(trimmed)) {
      toast.error('Webhook URL must start with https://')
      return
    }
    try {
      await saveWebhook({
        url: trimmed,
        enabled,
        secret: secret.trim() ? secret.trim() : undefined,
      }).unwrap()
      setSecret('')
      toast.success('Webhook saved')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to save webhook')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Outbound webhook
        </CardTitle>
        <CardDescription>
          Receive a signed HTTP POST for every notification, in addition to email and WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!allowed ? (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/40 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-mid)]">
              Outbound webhooks are available on the Platinum plan. Upgrade to deliver notifications
              to your own systems.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text)]">Endpoint URL</label>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://example.com/hooks/supplify"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-[var(--text-muted)]">Must be an https:// URL.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text)]">Signing secret</label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={
                  data?.webhook?.hasSecret ? '•••••••• (leave blank to keep)' : 'Optional'
                }
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Used to sign payloads with an <code>X-Supplify-Signature</code> HMAC-SHA256 header.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-4">
              <span className="text-sm text-[var(--text)]">Enabled</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSaving ? 'Saving…' : 'Save webhook'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
