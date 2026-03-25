package com.absensiku.webview

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SupabaseAuthServiceHeadersAndroidTest {
    @Test
    fun buildRequestHeaders_usesPublishableKeyForAnonSupabaseCalls() {
        val headers = SupabaseAuthService.buildRequestHeaders(
            publishableKey = "sb-publishable",
            useSupabaseHeaders = true,
            authBearerToken = null,
            extraHeaders = mapOf("Prefer" to "return=minimal")
        )

        assertEquals("sb-publishable", headers.apikey)
        assertEquals("Bearer sb-publishable", headers.authorization)
        assertEquals("return=minimal", headers.extras["Prefer"])
    }

    @Test
    fun buildRequestHeaders_prefersUserAccessTokenForUserScopedCalls() {
        val headers = SupabaseAuthService.buildRequestHeaders(
            publishableKey = "sb-publishable",
            useSupabaseHeaders = true,
            authBearerToken = "user-access-token",
            extraHeaders = emptyMap()
        )

        assertEquals("sb-publishable", headers.apikey)
        assertEquals("Bearer user-access-token", headers.authorization)
    }

    @Test
    fun buildRequestHeaders_skipsSupabaseDefaultsForNonSupabaseCalls() {
        val headers = SupabaseAuthService.buildRequestHeaders(
            publishableKey = "sb-publishable",
            useSupabaseHeaders = false,
            authBearerToken = null,
            extraHeaders = mapOf("Authorization" to "Bearer web-token", "X-Test" to "1")
        )

        assertNull(headers.apikey)
        assertEquals("Bearer web-token", headers.authorization)
        assertEquals("1", headers.extras["X-Test"])
        assertFalse(headers.extras.containsKey("Authorization"))
    }
}
