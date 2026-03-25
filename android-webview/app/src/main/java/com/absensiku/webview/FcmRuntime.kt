package com.absensiku.webview

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.RemoteMessage

object FcmRuntime {
    enum class PushSupportStatus {
        READY,
        DISABLED_IN_BUILD,
        GOOGLE_PLAY_SERVICES_MISSING,
        FIREBASE_NOT_READY,
    }

    const val EXTRA_TARGET_URL = "absensiku_push_target_url"
    private const val TAG = "AbsensikuFcm"
    private const val DEFAULT_TARGET_URL = "/employee/dashboard?tab=notifications"

    fun isEnabled(context: Context): Boolean {
        return pushSupportStatus(context) == PushSupportStatus.READY
    }

    fun pushSupportStatus(context: Context): PushSupportStatus {
        if (!BuildConfig.FCM_ENABLED) return PushSupportStatus.DISABLED_IN_BUILD
        if (!hasGooglePlayServices(context)) return PushSupportStatus.GOOGLE_PLAY_SERVICES_MISSING
        return if (ensureFirebaseApp(context)) {
            PushSupportStatus.READY
        } else {
            PushSupportStatus.FIREBASE_NOT_READY
        }
    }

    fun userVisibleSupportMessage(context: Context): String? {
        return when (pushSupportStatus(context)) {
            PushSupportStatus.READY -> null
            PushSupportStatus.DISABLED_IN_BUILD -> context.getString(R.string.push_not_ready_build)
            PushSupportStatus.GOOGLE_PLAY_SERVICES_MISSING -> context.getString(R.string.push_not_ready_play_services)
            PushSupportStatus.FIREBASE_NOT_READY -> context.getString(R.string.push_not_ready_firebase)
        }
    }

    fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channelId = context.getString(R.string.push_channel_id)
        val existingChannel = manager.getNotificationChannel(channelId)
        if (existingChannel != null) return

        val channel = NotificationChannel(
            channelId,
            context.getString(R.string.push_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = context.getString(R.string.push_channel_description)
        }
        manager.createNotificationChannel(channel)
    }

    fun currentPermissionState(context: Context): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            return if (granted) "granted" else "denied"
        }

        return if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            "granted"
        } else {
            "denied"
        }
    }

    fun setAutoInitEnabled(context: Context, enabled: Boolean) {
        if (!isEnabled(context)) return
        runCatching {
            FirebaseMessaging.getInstance().isAutoInitEnabled = enabled
        }.onFailure {
            Log.w(TAG, "Gagal mengubah auto-init FCM.", it)
        }
    }

    fun requestToken(
        context: Context,
        onSuccess: (String) -> Unit,
        onFailure: (Exception) -> Unit,
    ) {
        val supportStatus = pushSupportStatus(context)
        if (supportStatus != PushSupportStatus.READY) {
            onFailure(
                IllegalStateException(
                    userVisibleSupportMessage(context)
                        ?: "FCM belum dikonfigurasi penuh untuk build ini."
                )
            )
            return
        }

        setAutoInitEnabled(context, true)

        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                if (token.isNullOrBlank()) {
                    onFailure(IllegalStateException("FCM token kosong."))
                    return@addOnSuccessListener
                }
                onSuccess(token)
            }
            .addOnFailureListener { error ->
                onFailure(error as? Exception ?: IllegalStateException("Gagal mengambil token FCM."))
            }
    }

    fun resolveNotificationTitle(context: Context, message: RemoteMessage): String {
        return message.notification?.title
            ?: message.data["title"]
            ?: context.getString(R.string.push_notification_default_title)
    }

    fun resolveNotificationBody(message: RemoteMessage): String {
        return message.notification?.body
            ?: message.data["body"]
            ?: message.data["message"]
            ?: ""
    }

    fun resolveTargetUrl(message: RemoteMessage): String {
        return message.data["target_url"]
            ?: message.data["link"]
            ?: message.data["path"]
            ?: DEFAULT_TARGET_URL
    }

    private fun hasGooglePlayServices(context: Context): Boolean {
        return runCatching {
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
        }.onFailure {
            Log.w(TAG, "Gagal memeriksa Google Play Services.", it)
        }.getOrDefault(false)
    }

    private fun ensureFirebaseApp(context: Context): Boolean {
        runCatching {
            if (FirebaseApp.getApps(context).isNotEmpty()) return true
        }.getOrElse {
            Log.w(TAG, "Gagal memeriksa FirebaseApp aktif.", it)
        }

        runCatching {
            FirebaseApp.initializeApp(context)
        }.onSuccess { app ->
            if (app != null) return true
        }.onFailure {
            Log.w(TAG, "FirebaseApp default belum tersedia dari resources.", it)
        }

        val projectId = BuildConfig.FIREBASE_PROJECT_ID.trim()
        val senderId = BuildConfig.FIREBASE_SENDER_ID.trim()
        val appId = BuildConfig.FIREBASE_APP_ID.trim()
        val apiKey = BuildConfig.FIREBASE_API_KEY.trim()
        if (projectId.isBlank() || senderId.isBlank() || appId.isBlank() || apiKey.isBlank()) {
            return false
        }

        return runCatching {
            FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setProjectId(projectId)
                    .setGcmSenderId(senderId)
                    .setApplicationId(appId)
                    .setApiKey(apiKey)
                    .build()
            )
            true
        }.onFailure {
            Log.e(TAG, "Gagal inisialisasi Firebase manual.", it)
        }.getOrDefault(false)
    }
}
