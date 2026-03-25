package com.absensiku.webview

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeSessionPolicyAndroidTest {
    @Test
    fun persistedEmail_savedOnlyWhenRememberEnabled() {
        assertEquals(
            "pegawai@example.com",
            NativeSessionPolicy.persistedEmailForRememberSetting("pegawai@example.com", true)
        )
        assertNull(NativeSessionPolicy.persistedEmailForRememberSetting("pegawai@example.com", false))
        assertNull(NativeSessionPolicy.persistedEmailForRememberSetting("   ", true))
    }

    @Test
    fun bootstrapFailure_clearsStoredSessionOnlyWhenExplicitlyRequested() {
        assertFalse(NativeSessionPolicy.shouldClearStoredSessionOnBootstrapFailure(false))
        assertTrue(NativeSessionPolicy.shouldClearStoredSessionOnBootstrapFailure(true))
    }
}
