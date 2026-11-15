import * as SecureStore from 'expo-secure-store'

const KEY = 'supplify_guest_public_orders'
export type GuestOrderRecord = { token: string; reference: string; supplierName?: string; createdAt: string }

export async function loadGuestOrders(): Promise<GuestOrderRecord[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(KEY)) || '[]')
  } catch {
    return []
  }
}

export async function saveGuestOrder(record: GuestOrderRecord) {
  const current = await loadGuestOrders()
  const next = [record, ...current.filter((item) => item.token !== record.token)].slice(0, 20)
  await SecureStore.setItemAsync(KEY, JSON.stringify(next))
}
