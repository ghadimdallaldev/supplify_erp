import { useTranslation } from 'react-i18next'
import { changeAppLanguage } from '../i18n'
import { SUPPORTED_LANGUAGES } from '../i18n/config'
import { cn } from '../lib/utils'

type LanguageSwitcherProps = {
  compact?: boolean
  className?: string
}

export function LanguageSwitcher({ compact = false, className }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation('common')
  const active = i18n.language?.split('-')[0] || 'en'

  return (
    <div
      className={cn('inline-flex items-center gap-1', className)}
      role="group"
      aria-label={t('language.switch')}
      data-testid="language-switcher"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          data-testid={`language-option-${lang.code}`}
          aria-pressed={active === lang.code}
          onClick={() => void changeAppLanguage(lang.code)}
          className={cn(
            'rounded-md border text-xs font-medium transition-colors',
            compact ? 'px-2 py-1' : 'px-3 py-1.5',
            active === lang.code
              ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand)]'
              : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
          )}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
