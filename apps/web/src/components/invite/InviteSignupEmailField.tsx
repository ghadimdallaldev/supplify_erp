type Props = {
  invitedEmail: string | undefined
  value: string
  onChange: (value: string) => void
}

export function InviteSignupEmailField({ invitedEmail, value, onChange }: Props) {
  const locked = Boolean(invitedEmail?.trim())

  return (
    <label className="block text-sm">
      Email
      <input
        type="email"
        className={`mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2 ${
          locked ? 'bg-[var(--app-muted,#f4f4f5)] text-[var(--text-muted)]' : ''
        }`}
        value={value}
        onChange={(e) => {
          if (!locked) onChange(e.target.value)
        }}
        readOnly={locked}
        required
        autoComplete="email"
      />
      {locked ? (
        <span className="mt-1 block text-xs text-[var(--text-muted)]">
          Fixed to the address this invite was sent to. To use a different email, ask your admin for
          a new invitation.
        </span>
      ) : null}
    </label>
  )
}
