package com.absensiku.webview

internal class BootstrapSessionState(
    private var pendingSession: NativeAuthSession? = null,
    private var consumed: Boolean = false
) {
    fun stage(session: NativeAuthSession) {
        pendingSession = session
        consumed = false
    }

    fun peek(): NativeAuthSession? = pendingSession

    fun consume(): String? {
        val session = pendingSession ?: return null
        pendingSession = null
        consumed = true
        return session.toBridgeJson()
    }

    fun clear() {
        pendingSession = null
        consumed = false
    }

    fun hasPendingSession(): Boolean = pendingSession != null

    fun wasConsumed(): Boolean = consumed
}
