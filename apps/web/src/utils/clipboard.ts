export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy copy
    }
  }

  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    document.body.removeChild(textarea)
    return false
  }
}
