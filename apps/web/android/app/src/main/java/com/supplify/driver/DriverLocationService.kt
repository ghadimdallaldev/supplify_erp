package com.supplify.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/** Foreground-only location lifecycle. Upload/queue work is delegated to the Capacitor plugin. */
class DriverLocationService : Service() {
  private val client by lazy { LocationServices.getFusedLocationProviderClient(this) }
  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.locations.forEach { location ->
        sendBroadcast(Intent(ACTION_LOCATION).apply {
          setPackage(packageName)
          putExtra("latitude", location.latitude)
          putExtra("longitude", location.longitude)
          putExtra("accuracyMeters", location.accuracy)
          putExtra("speedMps", location.speed)
          putExtra("headingDegrees", location.bearing)
          putExtra("recordedAt", location.time)
        })
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    val channel = NotificationChannel(CHANNEL_ID, "Supplify driver tracking", NotificationManager.IMPORTANCE_LOW)
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    startForeground(NOTIFICATION_ID, notification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      client.removeLocationUpdates(callback)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15_000L)
      .setMinUpdateIntervalMillis(5_000L)
      .setWaitForAccurateLocation(false)
      .build()
    try {
      client.requestLocationUpdates(request, callback, mainLooper)
    } catch (_: SecurityException) {
      sendBroadcast(Intent(ACTION_PERMISSION_ERROR).setPackage(packageName))
    }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun notification(): Notification = NotificationCompat.Builder(this, CHANNEL_ID)
    .setContentTitle("Supplify delivery tracking active")
    .setContentText("Your location is shared with authorized delivery staff while this run is active.")
    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
    .setOngoing(true)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .build()

  companion object {
    const val CHANNEL_ID = "supplify-driver-location"
    const val NOTIFICATION_ID = 4401
    const val ACTION_LOCATION = "com.supplify.driver.LOCATION"
    const val ACTION_PERMISSION_ERROR = "com.supplify.driver.LOCATION_PERMISSION_ERROR"
    const val ACTION_STOP = "com.supplify.driver.STOP_LOCATION"
  }
}
