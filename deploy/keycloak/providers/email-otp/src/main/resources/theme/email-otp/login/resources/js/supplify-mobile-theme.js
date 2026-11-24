;(function () {
  'use strict'

  var root = document.documentElement
  var clientId = new URLSearchParams(window.location.search).get('client_id')
  if (clientId === 'supplify-mobile') {
    root.classList.add('supplify-mobile-auth')
    return
  }

  document.addEventListener(
    'DOMContentLoaded',
    function () {
      var form = document.querySelector(
        '.supplify-mobile-reset, form[action*="client_id=supplify-mobile&"], form[action$="client_id=supplify-mobile"]'
      )
      if (form) root.classList.add('supplify-mobile-auth')
    },
    { once: true }
  )
})()
