package com.absensiku.webview

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.util.UUID

data class NativeAuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long?,
    val expiresIn: Long?,
    val tokenType: String?,
    val userId: String?,
    val email: String?,
    val rememberSession: Boolean
) {
    fun toBridgeJson(): String {
        val payload = JSONObject()
            .put("access_token", accessToken)
            .put("refresh_token", refreshToken)
            .put("remember_session", rememberSession)

        expiresAt?.let { payload.put("expires_at", it) }
        expiresIn?.let { payload.put("expires_in", it) }
        tokenType?.let { payload.put("token_type", it) }

        val userPayload = JSONObject()
        if (!userId.isNullOrBlank()) userPayload.put("id", userId)
        if (!email.isNullOrBlank()) userPayload.put("email", email)
        if (userPayload.length() > 0) {
            payload.put("user", userPayload)
        }

        return payload.toString()
    }

    fun toPersistedJson(): String {
        return JSONObject(toBridgeJson()).put("stored_at", System.currentTimeMillis()).toString()
    }

    companion object {
        fun fromJson(raw: String?): NativeAuthSession? {
            if (raw.isNullOrBlank()) return null
            return runCatching {
                val json = JSONObject(raw)
                val user = json.optJSONObject("user")
                NativeAuthSession(
                    accessToken = json.optString("access_token"),
                    refreshToken = json.optString("refresh_token"),
                    expiresAt = json.optLong("expires_at").takeIf { it > 0L },
                    expiresIn = json.optLong("expires_in").takeIf { it > 0L },
                    tokenType = json.optString("token_type").takeIf { it.isNotBlank() },
                    userId = user?.optString("id")?.takeIf { it.isNotBlank() },
                    email = user?.optString("email")?.takeIf { it.isNotBlank() },
                    rememberSession = json.optBoolean("remember_session", false)
                )
            }.getOrNull()?.takeIf {
                it.accessToken.isNotBlank() && it.refreshToken.isNotBlank()
            }
        }
    }
}

class NativeSessionStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = createPreferences(appContext)

    init {
        migrateLegacyPreferencesIfNeeded()
    }

    fun saveSession(session: NativeAuthSession) {
        prefs.edit()
            .putString(KEY_SESSION_JSON, session.toPersistedJson())
            .putString(KEY_LAST_EMAIL, session.email ?: "")
            .putBoolean(KEY_REMEMBER_ENABLED, session.rememberSession)
            .apply()
    }

    fun getStoredSession(): NativeAuthSession? {
        return NativeAuthSession.fromJson(prefs.getString(KEY_SESSION_JSON, null))
    }

    fun getLastEmail(): String {
        return prefs.getString(KEY_LAST_EMAIL, "").orEmpty()
    }

    fun setLastEmail(email: String) {
        prefs.edit().putString(KEY_LAST_EMAIL, email).apply()
    }

    fun clearLastEmail() {
        prefs.edit().remove(KEY_LAST_EMAIL).apply()
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_SESSION_JSON)
            .putBoolean(KEY_REMEMBER_ENABLED, false)
            .apply()
    }

    fun getOrCreatePushInstallationId(): String {
        val existing = prefs.getString(KEY_PUSH_INSTALLATION_ID, null)?.takeIf { it.isNotBlank() }
        if (existing != null) return existing

        val generated = "APK-${UUID.randomUUID()}"
        prefs.edit().putString(KEY_PUSH_INSTALLATION_ID, generated).apply()
        return generated
    }

    fun savePushToken(token: String) {
        prefs.edit().putString(KEY_PUSH_TOKEN, token.trim()).apply()
    }

    fun getPushToken(): String? {
        return prefs.getString(KEY_PUSH_TOKEN, null)?.takeIf { it.isNotBlank() }
    }

    fun clearPushToken() {
        prefs.edit().remove(KEY_PUSH_TOKEN).apply()
    }

    fun setPushPermissionState(state: String) {
        prefs.edit().putString(KEY_PUSH_PERMISSION_STATE, state.trim()).apply()
    }

    fun getPushPermissionState(): String {
        return prefs.getString(KEY_PUSH_PERMISSION_STATE, "unknown").orEmpty().ifBlank { "unknown" }
    }

    fun shouldSyncPushToken(userId: String?, token: String, permissionState: String): Boolean {
        val normalizedToken = token.trim()
        if (normalizedToken.isBlank()) return false
        val expectedFingerprint = buildPushSyncFingerprint(userId, normalizedToken, permissionState)
        return prefs.getString(KEY_PUSH_SYNC_FINGERPRINT, null) != expectedFingerprint
    }

    fun markPushTokenSynced(userId: String?, token: String, permissionState: String) {
        prefs.edit()
            .putString(
                KEY_PUSH_SYNC_FINGERPRINT,
                buildPushSyncFingerprint(userId, token.trim(), permissionState)
            )
            .apply()
    }

    fun clearPushSyncFingerprint() {
        prefs.edit().remove(KEY_PUSH_SYNC_FINGERPRINT).apply()
    }

    fun isRememberEnabled(): Boolean {
        return prefs.getBoolean(KEY_REMEMBER_ENABLED, false)
    }

    fun setRememberEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_REMEMBER_ENABLED, enabled).apply()
    }

    // Tenant info caching
    fun saveTenantInfo(tenant: TenantInfo) {
        prefs.edit()
            .putString(KEY_TENANT_NAME, tenant.name)
            .putString(KEY_TENANT_CODE, tenant.code ?: "")
            .putString(KEY_TENANT_LOGO_URL, tenant.logoUrl ?: "")
            .putLong(KEY_TENANT_CACHED_AT, System.currentTimeMillis())
            .apply()
    }

    fun getCachedTenantInfo(): TenantInfo? {
        val name = prefs.getString(KEY_TENANT_NAME, null) ?: return null
        val code = prefs.getString(KEY_TENANT_CODE, null)
        val logoUrl = prefs.getString(KEY_TENANT_LOGO_URL, null)
        
        return TenantInfo(
            id = "", // Not stored in cache
            name = name,
            code = code?.takeIf { it.isNotBlank() },
            logoUrl = logoUrl?.takeIf { it.isNotBlank() }
        )
    }

    fun clearTenantInfo() {
        prefs.edit()
            .remove(KEY_TENANT_NAME)
            .remove(KEY_TENANT_CODE)
            .remove(KEY_TENANT_LOGO_URL)
            .remove(KEY_TENANT_CACHED_AT)
            .apply()
    }

    companion object {
        private const val TAG = "NativeSessionStore"
        private const val PREF_NAME = "absensiku_native_auth"
        private const val ENCRYPTED_PREF_NAME = "absensiku_native_auth_encrypted"
        private const val KEY_SESSION_JSON = "native_session_json"
        private const val KEY_LAST_EMAIL = "last_email"
        private const val KEY_REMEMBER_ENABLED = "remember_session_enabled"
        // Tenant cache keys
        private const val KEY_TENANT_NAME = "tenant_name"
        private const val KEY_TENANT_CODE = "tenant_code"
        private const val KEY_TENANT_LOGO_URL = "tenant_logo_url"
        private const val KEY_TENANT_CACHED_AT = "tenant_cached_at"
        private const val KEY_PUSH_INSTALLATION_ID = "push_installation_id"
        private const val KEY_PUSH_TOKEN = "push_token"
        private const val KEY_PUSH_SYNC_FINGERPRINT = "push_sync_fingerprint"
        private const val KEY_PUSH_PERMISSION_STATE = "push_permission_state"
    }

    private fun createPreferences(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                ENCRYPTED_PREF_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (error: Exception) {
            Log.w(TAG, "Encrypted storage unavailable, falling back to legacy SharedPreferences.", error)
            context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        }
    }

    private fun migrateLegacyPreferencesIfNeeded() {
        val legacyPrefs = appContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        if (legacyPrefs === prefs || legacyPrefs.all.isEmpty()) return
        if (prefs.contains(KEY_SESSION_JSON) || prefs.contains(KEY_LAST_EMAIL) || prefs.contains(KEY_REMEMBER_ENABLED)) {
            return
        }

        prefs.edit().apply {
            legacyPrefs.getString(KEY_SESSION_JSON, null)?.let { putString(KEY_SESSION_JSON, it) }
            legacyPrefs.getString(KEY_LAST_EMAIL, null)?.let { putString(KEY_LAST_EMAIL, it) }
            if (legacyPrefs.contains(KEY_REMEMBER_ENABLED)) {
                putBoolean(KEY_REMEMBER_ENABLED, legacyPrefs.getBoolean(KEY_REMEMBER_ENABLED, false))
            }
        }.apply()

        legacyPrefs.edit().clear().apply()
    }

    private fun buildPushSyncFingerprint(userId: String?, token: String, permissionState: String): String {
        val normalizedUserId = userId?.trim().takeUnless { it.isNullOrBlank() } ?: "anonymous"
        val normalizedPermissionState = permissionState.trim().ifBlank { "unknown" }
        return "$normalizedUserId|$normalizedPermissionState|$token"
    }
}
