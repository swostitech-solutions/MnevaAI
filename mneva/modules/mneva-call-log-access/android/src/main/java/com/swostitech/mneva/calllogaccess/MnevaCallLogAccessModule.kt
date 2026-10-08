package com.swostitech.mneva.calllogaccess

import android.content.Context
import android.provider.CallLog
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the device's call log via Android's standard CallLog.Calls content
 * provider. Unlike notification access, READ_CALL_LOG is a normal runtime
 * ("dangerous") permission — JS requests it directly with
 * PermissionsAndroid.request, so this module only needs to do the actual
 * query, not any permission bookkeeping.
 */
class MnevaCallLogAccessModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MnevaCallLogAccess")

    // sinceMillis: only rows whose call date is after this epoch-ms value
    // are returned, so JS can sync incrementally instead of re-reading the
    // whole call history on every check.
    Function("queryCallLog") { sinceMillis: Double ->
      val results = mutableListOf<Map<String, Any?>>()
      val projection = arrayOf(
        CallLog.Calls.NUMBER,
        CallLog.Calls.CACHED_NAME,
        CallLog.Calls.TYPE,
        CallLog.Calls.DATE,
        CallLog.Calls.DURATION,
      )
      val selection = "${CallLog.Calls.DATE} > ?"
      val selectionArgs = arrayOf(sinceMillis.toLong().toString())

      try {
        context.contentResolver.query(
          CallLog.Calls.CONTENT_URI,
          projection,
          selection,
          selectionArgs,
          "${CallLog.Calls.DATE} ASC",
        )?.use { cursor ->
          val numberIdx = cursor.getColumnIndex(CallLog.Calls.NUMBER)
          val nameIdx = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME)
          val typeIdx = cursor.getColumnIndex(CallLog.Calls.TYPE)
          val dateIdx = cursor.getColumnIndex(CallLog.Calls.DATE)
          val durationIdx = cursor.getColumnIndex(CallLog.Calls.DURATION)

          while (cursor.moveToNext()) {
            val type = cursor.getInt(typeIdx)
            // Only entries that represent a real two-way contact moment —
            // rejected/blocked/voicemail rows aren't "you talked to them".
            if (type != CallLog.Calls.INCOMING_TYPE &&
                type != CallLog.Calls.OUTGOING_TYPE &&
                type != CallLog.Calls.MISSED_TYPE
            ) continue

            results.add(
              mapOf(
                "number" to cursor.getString(numberIdx),
                "name" to cursor.getString(nameIdx),
                "type" to when (type) {
                  CallLog.Calls.INCOMING_TYPE -> "incoming"
                  CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                  CallLog.Calls.MISSED_TYPE -> "missed"
                  else -> "other"
                },
                "date" to cursor.getLong(dateIdx).toDouble(),
                "durationSec" to cursor.getLong(durationIdx).toDouble(),
              ),
            )
          }
        }
      } catch (_: SecurityException) {
        // READ_CALL_LOG isn't granted (or was revoked mid-session). JS
        // already gates the whole sync flow behind its own permission
        // check before calling this — this is just a safety net, not the
        // primary guard, so it fails quiet rather than throwing.
      }

      results
    }
  }
}
