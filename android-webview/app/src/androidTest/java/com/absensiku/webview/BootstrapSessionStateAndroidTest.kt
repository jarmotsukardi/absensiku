package com.absensiku.webview

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BootstrapSessionStateAndroidTest {
    @Test
    fun consume_returnsSessionOnlyOnce() {
        val state = BootstrapSessionState()
        state.stage(sampleSession())

        val first = state.consume()
        val second = state.consume()

        assertNotNull(first)
        assertNull(second)
        assertTrue(state.wasConsumed())
        assertFalse(state.hasPendingSession())
    }

    @Test
    fun clear_resetsPendingAndConsumedFlags() {
        val state = BootstrapSessionState()
        state.stage(sampleSession())
        state.consume()

        state.clear()

        assertNull(state.peek())
        assertFalse(state.wasConsumed())
        assertFalse(state.hasPendingSession())
    }

    private fun sampleSession(): NativeAuthSession {
        return NativeAuthSession(
            accessToken = "access-token",
            refreshToken = "refresh-token",
            expiresAt = 123L,
            expiresIn = 60L,
            tokenType = "bearer",
            userId = "user-1",
            email = "pegawai@example.com",
            rememberSession = true
        )
    }
}
