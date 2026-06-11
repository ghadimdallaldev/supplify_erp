// Audit types
export interface AuditLog {
  id: string
  actor_sub?: string
  actor_role?: string
  ip?: string
  action: string
  resource?: string
  resource_id?: string
  payload?: Record<string, any>
  status: number
  request_id?: string
  created_at: string
}

export interface AuditLogFilters {
  actor?: string
  action?: string
  resource?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface AuditLogsResponse {
  logs: AuditLog[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}
