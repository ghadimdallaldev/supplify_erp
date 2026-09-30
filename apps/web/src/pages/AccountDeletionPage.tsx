import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription } from '../components/ui/alert'
import { PageHeader } from '../components/ui/page-header'
import { LegalFooterLinks } from '../components/legal/LegalFooterLinks'
import { useGetMeQuery } from '../services/api'
import { apiUrl } from '../lib/apiBase'
import { redirectToAuth, redirectToLogout } from '../lib/authRedirect'

type RetentionSummary = {
  deleted: string[]
  anonymized: string[]
  retained: string[]
}

type OwnershipBlocker = {
  code: string
  workspaceType: 'SUPPLIER' | 'RESTAURANT'
  organizationId: string
  organizationName: string
  message: string
}

type DeletionStatus = {
  canDelete: boolean
  alreadyDeleted?: boolean
  blockers: OwnershipBlocker[]
  retention: RetentionSummary
  user?: { id: string; email?: string; role?: string; displayName?: string }
}

async function accountApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'Supplify',
      ...(init?.headers || {}),
    },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error?.message || 'Request failed') as Error & {
      code?: string
      details?: unknown
      status?: number
    }
    err.code = body?.error?.name
    err.details = body?.error?.details
    err.status = res.status
    throw err
  }
  return body.data as T
}

export function AccountDeletionPage() {
  const { data: me, isLoading: meLoading, isError: meError } = useGetMeQuery()
  const [status, setStatus] = useState<DeletionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [closeConfirm, setCloseConfirm] = useState<Record<string, string>>({})
  const [newOwnerId, setNewOwnerId] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)

  const isAuthenticated = Boolean(me) && !meError

  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    setError(null)
    try {
      const data = await accountApi<DeletionStatus>('/api/account/deletion-status')
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deletion status')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const handleLogin = () => {
    redirectToAuth('login', `${window.location.origin}/account/delete`)
  }

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      setError('Type DELETE to confirm permanent account deletion.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await accountApi('/api/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: 'DELETE' }),
      })
      setDone(true)
      redirectToLogout()
    } catch (e) {
      const err = e as Error & { code?: string; details?: { blockers?: OwnershipBlocker[] } }
      if (err.code === 'ORG_OWNER_MUST_TRANSFER_OR_CLOSE' && err.details?.blockers) {
        setStatus((prev) =>
          prev
            ? { ...prev, canDelete: false, blockers: err.details!.blockers as OwnershipBlocker[] }
            : prev
        )
      }
      setError(err.message || 'Deletion failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async (blocker: OwnershipBlocker) => {
    const target = newOwnerId[blocker.organizationId]?.trim()
    if (!target) {
      setError('Enter the new owner user id (UUID) from your team list.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await accountApi('/api/account/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: blocker.organizationId,
          workspaceType: blocker.workspaceType,
          newOwnerUserId: target,
        }),
      })
      await refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCloseOrg = async (blocker: OwnershipBlocker) => {
    setLoading(true)
    setError(null)
    try {
      await accountApi('/api/account/close-organization', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: blocker.organizationId,
          workspaceType: blocker.workspaceType,
          confirmationName: closeConfirm[blocker.organizationId] || '',
          reason: 'user_requested_before_account_deletion',
        }),
      })
      await refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Organization close failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <PageHeader
        title="Delete your Supplify account"
        description="Request permanent deletion of your personal account. Organization ownership is never removed as a side effect of this request."
      />

      {meLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking session…
        </div>
      ) : !isAuthenticated ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign in to delete your account</CardTitle>
            <CardDescription>
              Google Play and App Store require a way to delete your account without using the
              mobile app. Sign in on the web to start deletion here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={handleLogin}>Sign in to continue</Button>
            <p className="text-sm text-muted-foreground">
              After signing in you will return to this page to confirm deletion.
            </p>
            <Link className="text-sm underline" to="/legal/privacy_policy">
              Privacy Policy
            </Link>
          </CardContent>
        </Card>
      ) : done ? (
        <Alert>
          <AlertDescription>Your account deletion request completed. Signing out…</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete account
            </CardTitle>
            <CardDescription>
              Signed in as {status?.user?.email || me?.email}. This permanently deletes personal
              account data as described below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {loading && !status ? (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : null}

            {status?.retention ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Deleted</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {status.retention.deleted.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Anonymized</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {status.retention.anonymized.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Retained (legal / financial / audit)</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {status.retention.retained.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {status?.blockers?.length ? (
              <div className="space-y-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                  <p className="text-sm">
                    You are an organization owner. Deleting your personal account will{' '}
                    <strong>not</strong> close or delete the business. Transfer ownership or
                    explicitly close the organization first.
                  </p>
                </div>
                {status.blockers.map((blocker) => (
                  <div
                    key={blocker.organizationId}
                    className="space-y-3 rounded border bg-background p-3"
                  >
                    <p className="font-medium">
                      {blocker.organizationName} ({blocker.workspaceType})
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor={`owner-${blocker.organizationId}`}>
                        Transfer to user id (UUID)
                      </Label>
                      <Input
                        id={`owner-${blocker.organizationId}`}
                        value={newOwnerId[blocker.organizationId] || ''}
                        onChange={(e) =>
                          setNewOwnerId((prev) => ({
                            ...prev,
                            [blocker.organizationId]: e.target.value,
                          }))
                        }
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                      <Button
                        variant="secondary"
                        disabled={loading}
                        onClick={() => void handleTransfer(blocker)}
                      >
                        Transfer ownership
                      </Button>
                    </div>
                    <div className="space-y-2 border-t pt-3">
                      <Label htmlFor={`close-${blocker.organizationId}`}>
                        Or type the organization name to close it
                      </Label>
                      <Input
                        id={`close-${blocker.organizationId}`}
                        value={closeConfirm[blocker.organizationId] || ''}
                        onChange={(e) =>
                          setCloseConfirm((prev) => ({
                            ...prev,
                            [blocker.organizationId]: e.target.value,
                          }))
                        }
                        placeholder={blocker.organizationName}
                      />
                      <Button
                        variant="destructive"
                        disabled={loading}
                        onClick={() => void handleCloseOrg(blocker)}
                      >
                        Close organization
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {status?.canDelete ? (
              <div className="space-y-3">
                <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                />
                <Button
                  variant="destructive"
                  disabled={loading || confirmText !== 'DELETE'}
                  onClick={() => void handleDelete()}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Permanently delete my account
                </Button>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Need help? Contact privacy@supplify.com. See also the{' '}
              <Link className="underline" to="/legal/privacy_policy">
                Privacy Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      <LegalFooterLinks />
    </div>
  )
}
