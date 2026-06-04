import { Archive, MoreVertical, Pin, PinOff, Search, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

type Props = {
  participantName: string
  isPinned?: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  showMenu: boolean
  onToggleMenu: () => void
  onPin: () => void
  onArchive: () => void
  onDelete: () => void
  onBack?: () => void
  connected: boolean
  otherPartyTyping: boolean
}

export function ChatHeader({
  participantName,
  isPinned,
  searchQuery,
  onSearchChange,
  showMenu,
  onToggleMenu,
  onPin,
  onArchive,
  onDelete,
  onBack,
  connected,
  otherPartyTyping,
}: Props) {
  return (
    <CardHeader className="shrink-0 border-b bg-gradient-to-r from-[var(--brand-ultra)]/50 to-[var(--brand-pale)]/50 dark:from-[var(--brand)]/50 dark:to-[var(--text)]/50">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={onBack}
              >
                ← Back
              </Button>
            ) : null}
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              {isPinned ? (
                <Pin className="h-4 w-4 fill-current text-[var(--brand-mid)] dark:text-[var(--brand-light)]" />
              ) : null}
              <span className="truncate">{participantName}</span>
            </CardTitle>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                connected
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
              }`}
              title={connected ? 'Connected' : 'Reconnecting'}
            >
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Reconnecting'}</span>
            </span>
            <div className="relative hidden md:block">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-8 w-40 pl-8 lg:w-48"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
              ) : null}
            </div>
            <div className="relative conversation-menu-container">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleMenu}
                className="h-8 w-8 p-0"
                aria-label="Conversation options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {showMenu ? (
                <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-[var(--app-border)] bg-background p-1 shadow-xl dark:border-[var(--app-border-mid)]">
                  <button
                    type="button"
                    onClick={() => {
                      onPin()
                      onToggleMenu()
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm transition-colors hover:bg-[var(--brand-ultra)]"
                  >
                    {isPinned ? (
                      <>
                        <PinOff className="h-4 w-4" /> Unpin
                      </>
                    ) : (
                      <>
                        <Pin className="h-4 w-4" /> Pin
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onArchive()
                      onToggleMenu()
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm transition-colors hover:bg-[var(--brand-ultra)]"
                  >
                    <Archive className="h-4 w-4" /> Archive
                  </button>
                  <div className="my-1 border-t" />
                  <button
                    type="button"
                    onClick={() => {
                      onDelete()
                      onToggleMenu()
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {otherPartyTyping ? (
          <p className="text-xs text-[var(--text-muted)] animate-pulse">Typing…</p>
        ) : null}
        <div className="relative md:hidden">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Search in thread..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>
    </CardHeader>
  )
}
