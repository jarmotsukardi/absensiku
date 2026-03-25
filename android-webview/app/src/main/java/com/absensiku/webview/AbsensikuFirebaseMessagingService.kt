package com.absensiku.webview

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AbsensikuFirebaseMessagingService : FirebaseMessagingService() {
    companion object {
        private const val TAG = "AbsensikuFcmSvc"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val sessionStore = NativeSessionStore(this)
        sessionStore.savePushToken(token)
        sessionStore.clearPushSyncFingerprint()
        tryRegisterToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        FcmRuntime.ensureNotificationChannel(this)
        val body = FcmRuntime.resolveNotificationBody(message)
        if (body.isBlank()) return

        val targetUrl = FcmRuntime.resolveTargetUrl(message)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(FcmRuntime.EXTRA_TARGET_URL, targetUrl)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            targetUrl.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) {
                Log.w(TAG, "Push diterima tetapi izin notifikasi belum diberikan.")
                return
            }
        }

        val notification = NotificationCompat.Builder(this, getString(R.string.push_channel_id))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(FcmRuntime.resolveNotificationTitle(this, message))
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(this).notify((message.messageId ?: targetUrl).hashCode(), notification)
    }

    private fun tryRegisterToken(token: String) {
        val sessionStore = NativeSessionStore(this)
        val session = sessionStore.getStoredSession() ?: return
        val permissionState = FcmRuntime.currentPermissionState(this)
        val pushFingerprintChanged = sessionStore.shouldSyncPushToken(session.userId, token, permissionState)
        if (!pushFingerprintChanged) return

        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val authService = SupabaseAuthService(
                    supabaseUrl = BuildConfig.SUPABASE_URL,
                    publishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
                    webBaseUrl = BuildConfig.WEB_BASE_URL
                )
                authService.syncDevicePushToken(
                    authSession = session,
                    installationId = sessionStore.getOrCreatePushInstallationId(),
                    fcmToken = token,
                    deviceId = buildAndroidDeviceId(),
                    deviceModel = listOf(Build.MANUFACTURER, Build.MODEL)
                        .map { it.trim() }
                        .filter { it.isNotBlank() }
                        .joinToString(" "),
                    appVersion = BuildConfig.VERSION_NAME,
                    notificationPermissionState = permissionState,
                    appCode = BuildConfig.APP_CODE,
                    active = true
                )
                sessionStore.markPushTokenSynced(session.userId, token, permissionState)
            }.onFailure {
                Log.w(TAG, "Gagal sinkron token FCM dari service.", it)
            }
        }
    }

    private fun buildAndroidDeviceId(): String {
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return if (androidId.isNullOrBlank()) {
            "AND-${BuildConfig.APPLICATION_ID}-${Build.VERSION.SDK_INT}"
        } else {
            "AND-$androidId"
        }
    }
}
