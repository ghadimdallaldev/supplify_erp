import type { User } from '../../types/supplify'
import { api } from './client'

export function fetchMe() {
  return api.get<User>('/auth/me')
}

export function logoutApi() {
  return api.post<{ keycloakLogoutUrl?: string }>('/auth/logout')
}
