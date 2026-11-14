import { apiUrl } from './apiBase'
import { refreshAuthSession } from './authSessionRefresh'

/** Keep the object URL alive long enough for Safari to start reading the attachment. */
export async function downloadAuthenticatedFile(
  path: string,
  filename: string,
  contentType: string
) {
  const request = () =>
    fetch(apiUrl(path), {
      credentials: 'include',
      headers: { 'X-Requested-With': 'Supplify', Accept: contentType },
      cache: 'no-store',
    })
  let response = await request()
  if (response.status === 401) {
    const refreshed = await refreshAuthSession('fallback')
    if (refreshed.ok) response = await request()
  }
  if (!response.ok || !response.headers.get('content-type')?.includes(contentType)) {
    throw new Error('Unable to download file')
  }
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('Downloaded file is empty')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
