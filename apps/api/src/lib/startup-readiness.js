/** Set true after startup SQL migrations finish (success or no-op). */
let startupMigrationsReady = false

export function markStartupMigrationsReady() {
  startupMigrationsReady = true
}

export function isStartupMigrationsReady() {
  return startupMigrationsReady
}

export function resetStartupMigrationsReadyForTests() {
  startupMigrationsReady = false
}

/** Block API traffic until pending SQL migrations have been applied on this process. */
export function requireStartupMigrationsReady(req, res, next) {
  if (startupMigrationsReady) return next()
  return res.status(503).json({
    ok: false,
    data: null,
    error: {
      name: 'SERVICE_UNAVAILABLE',
      message: 'Server is applying database migrations. Retry in a few seconds.',
    },
    requestId: req.requestId,
  })
}
