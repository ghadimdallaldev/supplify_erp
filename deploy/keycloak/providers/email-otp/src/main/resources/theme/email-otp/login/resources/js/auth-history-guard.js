;(function () {
  'use strict'

  function isHistoryTraversal(event) {
    if (event && event.persisted) return true

    if (window.performance && typeof window.performance.getEntriesByType === 'function') {
      var entries = window.performance.getEntriesByType('navigation')
      if (entries.length > 0 && entries[0].type === 'back_forward') return true
    }

    return (
      window.performance &&
      window.performance.navigation &&
      window.performance.navigation.type === window.performance.navigation.TYPE_BACK_FORWARD
    )
  }

  // A completed Keycloak form is a single-use security page. Chrome can restore it
  // from the back-forward cache after the OAuth callback; returning to the existing
  // forward entry keeps the user in the authenticated app instead of an expired form.
  window.addEventListener('pageshow', function (event) {
    if (isHistoryTraversal(event)) window.history.forward()
  })
})()
