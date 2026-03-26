package com.absensiku.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class SupabaseAuthServiceInvitationParsingTest {

    @Test
    fun `payload invalid ditolak sebelum membuka dialog registrasi`() {
        try {
            toNativeInvitationData(
                payload = NativeInvitationLookupPayload(
                    id = null,
                    tenantId = null,
                    tenantName = null,
                    tenantCode = null,
                    tenantLogoUrl = null,
                    name = null,
                    email = null,
                    phone = null,
                    nik = null,
                    opdId = null,
                    officeId = null,
                    validationStatus = "invalid"
                ),
                invitationCode = "INVINVALID001",
                errorRefBuilder = { "TEST-INVALID-REF" }
            )
            fail("Expected SupabaseAuthException for invalid invitation payload")
        } catch (error: SupabaseAuthException) {
            assertEquals("Kode undangan tidak ditemukan atau sudah digunakan.", error.userMessage)
            assertEquals("TEST-INVALID-REF", error.errorRef)
        }
    }

    @Test
    fun `payload valid menormalkan nilai kosong menjadi hasil aman`() {
        val result = toNativeInvitationData(
            payload = NativeInvitationLookupPayload(
                id = "invite-123",
                tenantId = "tenant-123",
                tenantName = null,
                tenantCode = null,
                tenantLogoUrl = null,
                name = null,
                email = null,
                phone = null,
                nik = null,
                opdId = null,
                officeId = "office-123",
                validationStatus = "valid"
            ),
            invitationCode = "INV-VALID-001",
            errorRefBuilder = { "TEST-VALID-REF" }
        )

        assertEquals("invite-123", result.id)
        assertEquals("tenant-123", result.tenantId)
        assertEquals("INV-VALID-001", result.invitationCode)
        assertEquals("valid", result.validationStatus)
        assertNull(result.tenantName)
        assertNull(result.tenantCode)
        assertNull(result.tenantLogoUrl)
        assertNull(result.name)
        assertNull(result.email)
        assertNull(result.phone)
        assertEquals("", result.nik)
        assertNull(result.opdId)
        assertEquals("office-123", result.officeId)
    }

    @Test
    fun `payload valid tanpa id ditolak sebagai malformed`() {
        try {
            toNativeInvitationData(
                payload = NativeInvitationLookupPayload(
                    id = null,
                    tenantId = "tenant-123",
                    tenantName = null,
                    tenantCode = null,
                    tenantLogoUrl = null,
                    name = null,
                    email = null,
                    phone = null,
                    nik = null,
                    opdId = null,
                    officeId = null,
                    validationStatus = "valid"
                ),
                invitationCode = "INV-MALFORMED-001",
                errorRefBuilder = { "TEST-MALFORMED-REF" }
            )
            fail("Expected SupabaseAuthException for malformed invitation payload")
        } catch (error: SupabaseAuthException) {
            assertEquals(
                "Data undangan tidak lengkap. Coba lagi atau minta admin mengirim ulang undangan.",
                error.userMessage
            )
            assertEquals("TEST-MALFORMED-REF", error.errorRef)
        }
    }
}
