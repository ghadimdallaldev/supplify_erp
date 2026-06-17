import { useMemo, useState } from 'react'
import { Building2, Loader2, MessageSquare, Search, Store } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { useGetRestaurantsQuery, useGetSuppliersQuery } from '../../services/api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole?: string
  onSelectParticipant: (participantId: string) => void
  isCreating?: boolean
}

export function NewConversationDialog({
  open,
  onOpenChange,
  userRole,
  onSelectParticipant,
  isCreating = false,
}: Props) {
  const [search, setSearch] = useState('')
  const isSupplier = userRole === 'SUPPLIER'

  const { data: suppliersData, isLoading: suppliersLoading } = useGetSuppliersQuery(
    { q: search.trim() || undefined, limit: 50 },
    { skip: !open || isSupplier }
  )
  const { data: restaurantsData, isLoading: restaurantsLoading } = useGetRestaurantsQuery(
    { limit: 200, offset: 0 },
    { skip: !open || !isSupplier }
  )

  const participants = useMemo(() => {
    if (isSupplier) {
      const restaurants = restaurantsData?.restaurants ?? []
      const query = search.trim().toLowerCase()
      if (!query) return restaurants
      return restaurants.filter(
        (restaurant) =>
          restaurant.name?.toLowerCase().includes(query) ||
          restaurant.contact_email?.toLowerCase().includes(query) ||
          restaurant.slug?.toLowerCase().includes(query)
      )
    }
    return suppliersData?.suppliers ?? []
  }, [isSupplier, restaurantsData?.restaurants, search, suppliersData?.suppliers])

  const isLoading = isSupplier ? restaurantsLoading : suppliersLoading

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
    >
      <DialogContent size="md" className="gap-4">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            {isSupplier
              ? 'Choose a restaurant to open a thread.'
              : 'Choose a supplier to open a thread.'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <Input
            autoFocus
            placeholder={isSupplier ? 'Search restaurants…' : 'Search suppliers…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-8"
          />
        </div>

        <div className="max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-[var(--app-border)]">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text-mid)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {isSupplier ? 'Loading restaurants…' : 'Loading suppliers…'}
            </div>
          ) : participants.length === 0 ? (
            <div className="space-y-2 p-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                {isSupplier ? (
                  <Store className="h-5 w-5" aria-hidden />
                ) : (
                  <Building2 className="h-5 w-5" aria-hidden />
                )}
              </div>
              <p className="text-sm text-[var(--text-mid)]">
                {search.trim()
                  ? isSupplier
                    ? 'No restaurants match your search'
                    : 'No suppliers match your search'
                  : isSupplier
                    ? 'No restaurants available yet'
                    : 'No suppliers found'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--app-border)]">
              {participants.map((participant) => {
                const initial = (participant.name?.trim().charAt(0) || '?').toUpperCase()
                return (
                  <li key={participant.id}>
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={() => onSelectParticipant(participant.id)}
                      className="chat-list-item flex w-full items-center gap-3 px-3 py-3 text-left disabled:opacity-60"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-sm font-semibold text-[var(--brand-mid)]">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[var(--text)]">
                          {participant.name}
                        </p>
                        {participant.contact_email ? (
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {participant.contact_email}
                          </p>
                        ) : null}
                      </div>
                      <MessageSquare className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  )
}
