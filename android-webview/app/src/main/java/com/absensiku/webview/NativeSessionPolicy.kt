package com.absensiku.webview

internal object NativeSessionPolicy {
    fun persistedEmailForRememberSetting(email: String, rememberSession: Boolean): String? {
        val normalized = email.trim()
        if (!rememberSession || normalized.isBlank()) return null
        return normalized
    }

    fun shouldClearStoredSessionOnBootstrapFailure(clearRequested: Boolean): Boolean {
        return clearRequested
    }
}
