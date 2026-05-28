import { AsyncLocalStorage } from 'node:async_hooks'

/** Request-scoped log bindings (requestId, userId, tenantId, …) */
export const requestLogStore = new AsyncLocalStorage()
