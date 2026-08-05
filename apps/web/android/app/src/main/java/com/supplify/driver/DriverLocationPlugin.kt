package com.supplify.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(
  name = "DriverLocation",
  permissions = [
    Permission(strings = [Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION], alias = "location"),
    Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
  ]
)
class DriverLocationPlugin : Plugin() {
  private var locationReceiver: DriverLocationReceiver? = null
  private var sessionId: String? = null
  private var active = false

  override fun load() {
    super.load()
    locationReceiver = DriverLocationReceiver(this)
    ContextCompat.registerReceiver(context, locationReceiver!!, IntentFilter().apply {
      addAction(DriverLocationService.ACTION_LOCATION)
      addAction(DriverLocationService.ACTION_PERMISSION_ERROR)
    }, ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  @PluginMethod
  fun startTracking(call: PluginCall) {
    if (!hasLocationPermission()) {
      requestPermissionForAlias("location", call, "locationPermissionCallback")
      return
    }
    sessionId = call.getString("sessionId")
    val serviceIntent = Intent(context, DriverLocationService::class.java).apply {
      putExtra("sessionId", sessionId)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
    active = true
    call.resolve(JSObject().apply {
      put("sessionId", sessionId ?: "native-session")
      put("active", true)
    })
  }

  @PluginMethod
  fun stopTracking(call: PluginCall) {
    context.stopService(Intent(context, DriverLocationService::class.java).setAction(DriverLocationService.ACTION_STOP))
    active = false
    call.resolve()
  }

  @PluginMethod
  fun getStatus(call: PluginCall) {
    call.resolve(JSObject().apply {
      put("active", active)
      put("provider", "native-android")
      put("sessionId", sessionId)
      put("gpsState", if (hasLocationPermission()) if (active) "TRACKING_ACTIVE" else "READY" else "LOCATION_PERMISSION_DENIED")
      put("networkState", "online")
      put("pendingLocationCount", pendingPoints().length())
      put("lastSyncedAt", null)
      put("error", null)
    })
  }

  @PluginMethod
  fun getPendingLocationCount(call: PluginCall) { call.resolve(JSObject().put("count", pendingPoints().length())) }

  @PluginMethod
  fun getPendingLocations(call: PluginCall) {
    val output = JSONArray()
    val pending = pendingPoints()
    for (index in 0 until pending.length()) {
      output.put(JSONObject(pending.getString(index)))
    }
    call.resolve(JSObject().put("points", output))
  }

  @PluginMethod
  fun acknowledgeLocation(call: PluginCall) {
    val id = call.getString("id")
    if (!id.isNullOrBlank()) {
      val remaining = JSONArray()
      val pending = pendingPoints()
      for (index in 0 until pending.length()) {
        val point = JSONObject(pending.getString(index))
        if (point.optString("id") != id) remaining.put(point.toString())
      }
      savePendingPoints(remaining)
    }
    call.resolve()
  }

  @PluginMethod
  fun syncPendingLocations(call: PluginCall) { call.resolve(JSObject().put("count", pendingPoints().length())) }

  fun notifyLocation(point: JSObject) {
    val pending = pendingPoints()
    if (pending.length() >= MAX_PENDING_POINTS) pending.remove(0)
    pending.put(point.toString())
    savePendingPoints(pending)
    notifyListeners("location", point)
  }

  fun notifyPermissionError() {
    active = false
    notifyListeners("status", JSObject().apply {
      put("active", false)
      put("provider", "native-android")
      put("sessionId", sessionId)
      put("gpsState", "LOCATION_PERMISSION_DENIED")
      put("networkState", "offline")
      put("pendingLocationCount", pendingPoints().length())
      put("lastSyncedAt", null)
      put("error", "LOCATION_PERMISSION_DENIED")
    })
  }

  private fun pendingPoints(): JSONArray {
    val value = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PENDING_KEY, "[]") ?: "[]"
    return try { JSONArray(value) } catch (_: Exception) { JSONArray() }
  }

  private fun savePendingPoints(points: JSONArray) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(PENDING_KEY, points.toString()).apply()
  }

  @PermissionCallback
  private fun locationPermissionCallback(call: PluginCall) {
    if (hasLocationPermission()) startTracking(call)
    else call.reject("Location permission denied", "LOCATION_PERMISSION_DENIED")
  }

  private fun hasLocationPermission(): Boolean =
    getPermissionState("location") == PermissionState.GRANTED

  companion object {
    private const val PREFS_NAME = "supplify_driver_tracking"
    private const val PENDING_KEY = "pending_points"
    private const val MAX_PENDING_POINTS = 2000
  }
}
