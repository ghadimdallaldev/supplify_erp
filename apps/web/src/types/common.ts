// Common types
export interface Address {
  street?: string
  city?: string
  region?: string
  country?: string
}

export interface ApiResponse<T> {
  ok: boolean
  data: T | null
  error: {
    name: string
    message: string
    details?: any
  } | null
  requestId: string
}
