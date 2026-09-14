import { useEffect, useState } from 'react'

function readIsDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

/**
 * Tracks the `.dark` class on <html> (toggled by `applyAdminPreferences`) so
 * components that need a theme-aware asset (logo wordmark, theme toggle icon)
 * re-render when the admin switches theme.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(readIsDark)

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const root = document.documentElement
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    setIsDark(root.classList.contains('dark'))
    return () => observer.disconnect()
  }, [])

  return isDark
}
