package com.swostitech.mneva.notificationaccess

import android.app.Notification
import android.content.Context
import android.os.Bundle
import android.service.notification.StatusBarNotification
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Android calls this only after the user explicitly grants Notification access.
 * The service keeps no notification history: it extracts an alert, removes OTPs,
 * then sends a minimal JSON payload to the already configured Mneva endpoint.
 */
class MnevaNotificationListenerService : android.service.notification.NotificationListenerService() {
  private val executor = Executors.newSingleThreadExecutor()

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName || sbn.isOngoing) return
    val prefs = getSharedPreferences(MnevaNotificationAccessModule.PREFERENCES, Context.MODE_PRIVATE)
    val endpoint = prefs.getString(MnevaNotificationAccessModule.KEY_ENDPOINT, null) ?: return
    val token = prefs.getString(MnevaNotificationAccessModule.KEY_TOKEN, null) ?: return
    val extras = sbn.notification.extras ?: Bundle.EMPTY
    val title = redact(readText(extras, Notification.EXTRA_TITLE))
    val body = redact(
      readText(extras, Notification.EXTRA_BIG_TEXT).ifBlank {
        readText(extras, Notification.EXTRA_TEXT)
      }
    )
    if (title.isBlank() && body.isBlank()) return

    val appName = try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
    } catch (_: Exception) { sbn.packageName }

    executor.execute {
      post(endpoint, token, JSONObject().apply {
        put("packageName", sbn.packageName)
        put("appName", appName)
        put("notificationKey", sbn.key)
        put("postedAt", sbn.postTime)
        put("title", title)
        put("body", body)
      })
    }
  }

  private fun readText(extras: Bundle, key: String): String =
    extras.getCharSequence(key)?.toString()?.trim().orEmpty().take(1000)

  // Never upload numeric OTPs / verification codes. The server repeats this
  // redaction as a defence-in-depth check.
  private fun redact(value: String): String = value
    .replace(Regex("\\b\\d{4,8}\\b"), "••••")
    .take(1000)

  private fun post(endpoint: String, token: String, payload: JSONObject) {
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 15_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("X-Mneva-Device-Token", token)
      }
      connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(payload.toString()) }
      connection.responseCode // Finish the request and free the connection.
    } catch (_: Exception) {
      // Notification delivery is best effort; Android will keep listening for
      // subsequent alerts rather than crashing the host app on a network error.
    } finally {
      connection?.disconnect()
    }
  }

  override fun onDestroy() {
    executor.shutdown()
    super.onDestroy()
  }
}
