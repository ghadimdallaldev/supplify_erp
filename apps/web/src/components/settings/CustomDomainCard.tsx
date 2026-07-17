import { useEffect, useState } from 'react'
import { Globe, Loader2, Save, ShieldCheck, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  useGetSupplierCustomDomainQuery,
  useUpdateSupplierCustomDomainMutation,
  useVerifySupplierCustomDomainMutation,
} from '../../services/api'

type Props = {
  allowed: boolean
}

export function CustomDomainCard({ allowed }: Props) {
  const { data, isLoading, refetch } = useGetSupplierCustomDomainQuery()
  const [updateDomain, { isLoading: saving }] = useUpdateSupplierCustomDomainMutation()
  const [verifyDomain, { isLoading: verifying }] = useVerifySupplierCustomDomainMutation()
  const [hostname, setHostname] = useState('')
  const [instructions, setInstructions] = useState<{
    txtRecord: { name: string; value: string }
    cnameRecord: { name: string; value: string }
    note: string
  } | null>(null)

  useEffect(() => {
    if (data?.customDomain?.hostname) {
      setHostname(data.customDomain.hostname)
    }
  }, [data?.customDomain?.hostname])

  if (isLoading) return null

  const domain = data?.customDomain
  const isVerified = Boolean(domain?.verifiedAt)

  const handleSave = async () => {
    const trimmed = hostname.trim().toLowerCase()
    if (!trimmed) {
      toast.error('Enter a hostname')
      return
    }
    try {
      const result = await updateDomain({ hostname: trimmed }).unwrap()
      setInstructions(result.customDomain.verificationInstructions ?? null)
      toast.success('Domain saved — add DNS records then verify')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to save domain')
    }
  }

  const handleVerify = async () => {
    try {
      await verifyDomain().unwrap()
      toast.success('Domain verified')
      setInstructions(null)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Verification failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Custom catalog domain
        </CardTitle>
        <CardDescription>
          Serve your public supplier catalog on your own hostname (e.g. catalog.yourbrand.com).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!allowed ? (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/40 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-mid)]">Custom domains are available on Scale.</p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hostname</label>
              <Input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="catalog.example.com"
              />
            </div>

            {instructions && (
              <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/40 p-4 text-sm space-y-2">
                <p className="font-medium text-[var(--text)]">DNS verification</p>
                <p className="text-[var(--text-muted)]">{instructions.note}</p>
                <p>
                  <span className="text-[var(--text-muted)]">TXT </span>
                  <code className="text-xs">{instructions.txtRecord.name}</code> ={' '}
                  <code className="text-xs">{instructions.txtRecord.value}</code>
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">CNAME </span>
                  <code className="text-xs">{instructions.cnameRecord.name}</code> →{' '}
                  <code className="text-xs">{instructions.cnameRecord.value}</code>
                </p>
              </div>
            )}

            {isVerified && domain && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                Verified — catalog is served at {domain.hostname}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save hostname
              </Button>
              {domain && !isVerified && (
                <Button variant="outline" onClick={handleVerify} disabled={verifying}>
                  {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verify DNS
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
