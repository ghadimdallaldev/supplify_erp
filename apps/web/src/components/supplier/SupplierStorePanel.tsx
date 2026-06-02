import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { useSupplifyModel } from '../../hooks/useSupplifyModel'
import { publicFrontendUrl } from '../../lib/env'
import {
  useCreateSupplierRestaurantInvitationMutation,
  useGetSupplierRestaurantInvitationsQuery,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Copy, Link2, UserPlus } from 'lucide-react'

type Props = {
  supplierId: string
}

export function SupplierStorePanel({ supplierId }: Props) {
  const { isV2, config } = useSupplifyModel()
  const supplier = config.supplier as {
    storeTitle?: string
    storeSubtitle?: string
    inviteRestaurantsCta?: string
    shareStoreLabel?: string
  }

  const orderingLink = `${publicFrontendUrl.replace(/\/$/, '')}/app/suppliers/${supplierId}`

  const { data, refetch } = useGetSupplierRestaurantInvitationsQuery(undefined, {
    skip: !isV2,
  })
  const [createInvite, { isLoading }] = useCreateSupplierRestaurantInvitationMutation()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [restaurantName, setRestaurantName] = useState('')

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(orderingLink)
      toast.success('Ordering link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error('Restaurant email is required')
      return
    }
    try {
      const result = await createInvite({
        invited_email: email.trim(),
        invited_name: name.trim() || undefined,
        restaurant_name: restaurantName.trim() || undefined,
      }).unwrap()
      toast.success('Invitation created — share the link with the restaurant')
      if (result.invite_url) {
        await navigator.clipboard.writeText(result.invite_url)
        toast.success('Invite link copied to clipboard')
      }
      setEmail('')
      setName('')
      setRestaurantName('')
      refetch()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to create invitation'
      toast.error(msg)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StoreIcon />
          {isV2 ? (supplier.storeTitle ?? 'Supplier Store') : (supplier.storeTitle ?? 'Catalog')}
        </CardTitle>
        <CardDescription>
          {isV2
            ? (supplier.storeSubtitle ?? 'Private B2B Store')
            : (supplier.storeSubtitle ?? 'Your supplier profile and catalog')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{isV2 ? (supplier.shareStoreLabel ?? 'Ordering Link') : 'Catalog link'}</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={orderingLink} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyLink}
              title="Copy link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            Restaurants sign in to order from this store.
            {isV2 ? '' : ' Public slug URL — TODO for a standalone storefront.'}
          </p>
        </div>

        {isV2 && (
          <div className="border-t border-[var(--border)] pt-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {supplier.inviteRestaurantsCta ?? 'Invite Restaurants'}
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="invite-email">Restaurant email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@restaurant.com"
                />
              </div>
              <div>
                <Label htmlFor="invite-name">Contact name</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="invite-restaurant">Restaurant name</Label>
                <Input
                  id="invite-restaurant"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <Button onClick={handleInvite} disabled={isLoading}>
              {isLoading ? 'Creating…' : 'Create invite link'}
            </Button>
            {(data?.invitations?.length ?? 0) > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {data?.invitations?.length} invitation(s) —{' '}
                {data?.invitations?.filter((i) => i.status === 'accepted').length} accepted
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StoreIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
      <path d="M3 9 5 3h14l2 6" />
    </svg>
  )
}
