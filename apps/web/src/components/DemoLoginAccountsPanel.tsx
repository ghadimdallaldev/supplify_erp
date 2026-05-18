import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from './ui/button'
import {
  DEMO_LOGIN_ACCOUNTS,
  DEMO_LOGIN_GROUPS,
  type DemoLoginAccount,
} from '../lib/demoLoginAccounts'

async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error('Copy failed')
  }
}

function roleColors(role: string) {
  if (role === 'Admin') return { bg: 'var(--brand-pale)', color: 'var(--brand-mid)' }
  if (role === 'Supplier') return { bg: 'var(--brand-pale)', color: 'var(--brand-mid)' }
  return { bg: 'var(--mint-pale)', color: 'var(--mint)' }
}

function AccountRow({ account }: { account: DemoLoginAccount }) {
  const [copied, setCopied] = useState<'email' | 'pass' | 'both' | null>(null)
  const theme = roleColors(account.role)

  const onCopy = async (kind: 'email' | 'pass' | 'both') => {
    if (kind === 'email') await copyText(account.email, 'Email copied')
    else if (kind === 'pass') await copyText(account.password, 'Password copied')
    else await copyText(`${account.email}\t${account.password}`, 'Email + password copied')
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{ background: theme.bg, borderColor: `${theme.color}33` }}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span
          className="font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white text-[10px]"
          style={{ color: theme.color }}
        >
          {account.role}
        </span>
        {account.label && (
          <span className="text-[var(--text-muted)] truncate max-w-[180px]">{account.label}</span>
        )}
      </div>
      <div className="font-mono text-[11px] text-[var(--text)] break-all select-all">
        {account.email}
      </div>
      <div className="text-[var(--text-muted)] mt-0.5">
        <span className="font-mono select-all">{account.password}</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px] bg-white/80"
          onClick={() => onCopy('email')}
        >
          {copied === 'email' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span className="ml-1">Email</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px] bg-white/80"
          onClick={() => onCopy('pass')}
        >
          {copied === 'pass' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span className="ml-1">Pass</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px] bg-white/80"
          onClick={() => onCopy('both')}
        >
          {copied === 'both' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span className="ml-1">Both</span>
        </Button>
      </div>
    </div>
  )
}

function GroupSection({
  groupId,
  title,
  description,
  defaultOpen,
}: {
  groupId: DemoLoginAccount['group']
  title: string
  description: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const accounts = DEMO_LOGIN_ACCOUNTS.filter((a) => a.group === groupId)
  if (accounts.length === 0) return null

  return (
    <div className="border rounded-lg overflow-hidden border-[var(--app-border)]">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium bg-[var(--brand-ultra)] hover:bg-[var(--brand-pale)]/50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1">{title}</span>
        <span className="text-[10px] font-normal text-[var(--text-muted)]">{accounts.length}</span>
      </button>
      {open && (
        <div className="p-2 space-y-2 max-h-64 overflow-y-auto bg-card">
          <p className="text-[10px] text-[var(--text-muted)] px-1">{description}</p>
          {accounts.map((account) => (
            <AccountRow key={account.email} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}

export function DemoLoginAccountsPanel() {
  const copyAllEmails = () => {
    const lines = DEMO_LOGIN_ACCOUNTS.map(
      (a) => `${a.role}\t${a.label || ''}\t${a.email}\t${a.password}`
    )
    copyText(lines.join('\n'), `Copied ${lines.length} accounts`)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          Seeded users — copy email/password, then use Keycloak sign-in
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px] shrink-0"
          onClick={copyAllEmails}
        >
          <Copy className="h-3 w-3 mr-1" />
          Copy all
        </Button>
      </div>
      {DEMO_LOGIN_GROUPS.map((g, i) => (
        <GroupSection
          key={g.id}
          groupId={g.id}
          title={g.title}
          description={g.description}
          defaultOpen={i < 2}
        />
      ))}
    </div>
  )
}
