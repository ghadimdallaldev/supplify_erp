/** Per-browser admin shell conveniences (not synced to the server). */
export const ADMIN_SIDEBAR_COLLAPSED_KEY = 'supplify.admin.sidebarCollapsed'

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode / blocked storage — collapse still works for the session */
  }
}
