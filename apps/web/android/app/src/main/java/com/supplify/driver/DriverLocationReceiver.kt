package com.supplify.driver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.getcapacitor.JSObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DriverLocationReceiver(private val plugin: DriverLocationPlugin) : BroadcastReceiver() {
  override fun onReceive(context: Context?, intent: Intent?) {
    if (intent?.action == DriverLocationService.ACTION_LOCATION) {
      plugin.notifyLocation(JSObject().apply {
        put("id", java.util.UUID.randomUUID().toString())
        put("sequence", intent.getLongExtra("sequence", System.currentTimeMillis()))
        put("recordedAt", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date(intent.getLongExtra("recordedAt", System.currentTimeMillis()))))
        put("latitude", intent.getDoubleExtra("latitude", 0.0))
        put("longitude", intent.getDoubleExtra("longitude", 0.0))
        put("accuracyMeters", intent.getFloatExtra("accuracyMeters", 0f).toDouble())
        put("speedMps", intent.getFloatExtra("speedMps", 0f).toDouble())
        put("headingDegrees", intent.getFloatExtra("headingDegrees", 0f).toDouble())
        put("networkState", "online")
      })
    } else if (intent?.action == DriverLocationService.ACTION_PERMISSION_ERROR) {
      plugin.notifyPermissionError()
    }
  }
}
