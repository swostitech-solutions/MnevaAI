package com.swostitech.mneva.notificationaccess

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MnevaNotificationAccessModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MnevaNotificationAccess")

    Function("configure") { endpoint: String, deviceToken: String ->
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
        .putString(KEY_ENDPOINT, endpoint.trim())
        .putString(KEY_TOKEN, deviceToken)
        .apply()
    }

    Function("clear") {
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().apply()
    }

    Function("isEnabled") {
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ).orEmpty()
      val component = ComponentName(context, MnevaNotificationListenerService::class.java)
      enabled.split(':').any { value ->
        ComponentName.unflattenFromString(value) == component
      }
    }

    Function("openSettings") {
      val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  companion object {
    const val PREFERENCES = "mneva_notification_access"
    const val KEY_ENDPOINT = "endpoint"
    const val KEY_TOKEN = "device_token"
  }
}
