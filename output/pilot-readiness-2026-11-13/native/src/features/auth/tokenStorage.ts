import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { assertRequestScope, getRequestScopeVersion } from './requestScope'

const ACCESS_KEY = 'supplify_access_token'
const REFRESH_KEY = 'supplify_refresh_token'
const ID_KEY = 'supplify_id_token'
const TENANT_KEY = 'supplify_active_tenant_token'

const isWeb = Platform.OS === 'web'
let pendingWrite: Promise<void> = Promise.resolve()

function serializeTokenWrite(write: () => Promise<void>): Promise<void> {
  const operation = pendingWrite.then(write, write)
  pendingWrite = operation.catch(() => {})
  return operation
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  return SecureStore.getItemAsync(key)
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_KEY)
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_KEY)
}

export async function getIdToken(): Promise<string | null> {
  return getItem(ID_KEY)
}

export async function getActiveTenantToken(): Promise<string | null> {
  return getItem(TENANT_KEY)
}

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  idToken?: string | null,
  scope = getRequestScopeVersion()
): Promise<void> {
  return serializeTokenWrite(async () => {
    assertRequestScope(scope)
    const writes: Promise<void>[] = [
      setItem(ACCESS_KEY, accessToken),
      setItem(REFRESH_KEY, refreshToken),
    ]
    if (idToken) writes.push(setItem(ID_KEY, idToken))
    await Promise.all(writes)
  })
}

export async function saveActiveTenantToken(token: string | null): Promise<void> {
  const scope = getRequestScopeVersion()
  return serializeTokenWrite(async () => {
    assertRequestScope(scope)
    if (token) await setItem(TENANT_KEY, token)
    else await deleteItem(TENANT_KEY)
  })
}

export async function clearTokens(): Promise<void> {
  return serializeTokenWrite(async () => { await Promise.all([
    deleteItem(ACCESS_KEY),
    deleteItem(REFRESH_KEY),
    deleteItem(ID_KEY),
    deleteItem(TENANT_KEY),
  ]) })
}
