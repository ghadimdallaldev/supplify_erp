import {
  Archive,
  ArrowLeft,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { CardHeader } from '../ui/card'
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
  const initial = (participantName.trim().charAt(0) || '?').toUpperCase()

  return (
    <CardHeader className="shrink-0 space-y-3 border-b border-[var(--app-border)] bg-[var(--surface)] py-3">
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 lg:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        ) : null}

        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-sm font-semibold text-[var(--brand-mid)]"
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isPinned ? (
              <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--brand-mid)]" />
            ) : null}
            <h2 className="truncate text-base font-semibold text-[var(--text)]">
              {participantName}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-mid)]">
            {otherPartyTyping ? (
              <span className="text-[var(--brand-mid)]">Typing…</span>
            ) : connected ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]" aria-hidden />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--amber)]">
                <WifiOff className="h-3 w-3" aria-hidden />
                Reconnecting
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`hidden items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium sm:inline-flex ${
              connected
                ? 'bg-[var(--mint-pale)] text-[var(--mint)]'
                : 'bg-[var(--amber-pale)] text-[var(--amber)]'
            }`}
            title={connected ? 'Live connection' : 'Reconnecting'}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'Live' : 'Offline'}
          </span>

          <div className="relative hidden md:block">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              placeholder="Search in thread…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 w-36 pl-8 lg:w-44"
              aria-label="Search messages in thread"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-label="Clear message search"
              >
                <X className="h-4 w-4" />
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
              aria-expanded={showMenu}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {showMenu ? (
              <div className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-1">
                <button
                  type="button"
                  onClick={() => {
                    onPin()
                    onToggleMenu()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--brand-ultra)]"
                >
                  {isPinned ? (
                    <>
                      <PinOff className="h-4 w-4" /> Unpin
                    </>
                  ) : (
                    <>
                      <Pin className="h-4 w-4" /> Pin conversation
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onArchive()
                    onToggleMenu()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--brand-ultra)]"
                >
                  <Archive className="h-4 w-4" /> Archive
                </button>
                <div className="my-1 h-px bg-[var(--app-border)]" />
                <button
                  type="button"
                  onClick={() => {
                    onDelete()
                    onToggleMenu()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--red)] transition-colors hover:bg-[var(--red-pale)]"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative md:hidden">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <Input
          placeholder="Search in thread…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8"
          aria-label="Search messages in thread"
        />
      </div>
    </CardHeader>
  )
}
