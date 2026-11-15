/** Invalidates in-flight authenticated work before an account/workspace can change. */
let version = 0
const requests = new Set<AbortController>()

export class SessionChangedError extends Error {
  constructor() {
    super('Your account or workspace changed. Please try again.')
    this.name = 'SessionChangedError'
  }
}

export function getRequestScopeVersion() {
  return version
}

export function assertRequestScope(expected: number) {
  if (expected !== version) throw new SessionChangedError()
}

export function registerScopedRequest(controller: AbortController) {
  requests.add(controller)
  return () => requests.delete(controller)
}

export function invalidateRequestScope() {
  version += 1
  for (const controller of requests) controller.abort()
  requests.clear()
}
