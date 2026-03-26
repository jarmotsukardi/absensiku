package com.absensiku.webview

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.ProtocolException
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class NativeOtpDispatchResult(
    val destination: String?,
    val message: String
)

data class NativeLoginResult(
    val session: NativeAuthSession,
    val bootstrapCookie: String?
)

data class NativeIdentityValidationResult(
    val name: String?,
    val message: String
)

data class NativeInvitationData(
    val id: String,
    val tenantId: String,
    val tenantName: String?,
    val tenantCode: String?,
    val tenantLogoUrl: String?,
    val invitationCode: String,
    val name: String?,
    val email: String?,
    val nik: String,
    val phone: String?,
    val opdId: String?,
    val officeId: String?,
    val validationStatus: String
)

internal data class NativeInvitationLookupPayload(
    val id: String?,
    val tenantId: String?,
    val tenantName: String?,
    val tenantCode: String?,
    val tenantLogoUrl: String?,
    val name: String?,
    val email: String?,
    val phone: String?,
    val nik: String?,
    val opdId: String?,
    val officeId: String?,
    val validationStatus: String?
)

data class TenantInfo(
    val id: String,
    val name: String,
    val code: String?,
    val logoUrl: String?
)

data class NativeOrganizationRegistrationData(
    val name: String,
    val email: String,
    val whatsapp: String,
    val password: String,
    val organizationName: String,
    val organizationType: String,
    val officeName: String,
    val officeAddress: String,
    val officeLatitude: String,
    val officeLongitude: String
)

class SupabaseAuthException(
    val userMessage: String,
    val errorRef: String,
    cause: Throwable? = null
) : Exception("$userMessage [$errorRef]", cause)

class SupabaseAuthService(
    private val supabaseUrl: String,
    private val publishableKey: String,
    private val webBaseUrl: String
) {
    internal data class RequestHeaders(
        val apikey: String?,
        val authorization: String?,
        val extras: Map<String, String>
    )

    fun signInWithPassword(
        email: String,
        password: String,
        rememberSession: Boolean,
        deviceId: String,
        appVersion: String,
        appCode: String
    ): NativeLoginResult {
        requireConfigured()

        val endpoint = "${webBaseUrl.trimEnd('/')}/mobile-api/auth/login"
        val response = executeJsonRequest(
            method = "POST",
            endpoint = endpoint,
            requestBody = JSONObject()
                .put("email", email)
                .put("password", password)
                .put("remember_session", rememberSession)
                .put("device_id", deviceId)
                .put("app_version", appVersion)
                .put("app_code", appCode),
            extraHeaders = mapOf("X-Absensiku-Native-Client" to "android-webview"),
            useSupabaseHeaders = false
        )

        if (!response.isSuccessful) {
            throw createApiError("LOGIN", response.statusCode, response.body)
        }

        val json = JSONObject(response.body)
        if (!json.optBoolean("ok", true)) {
            val message = json.optString("message").ifBlank { "Login gagal." }
            val ref = json.optString("ref_id").ifBlank { buildErrorRef("LOGIN") }
            throw SupabaseAuthException(message, ref)
        }

        val sessionJson = json.optJSONObject("session") ?: json
        val user = sessionJson.optJSONObject("user")

        val session = NativeAuthSession(
            accessToken = sessionJson.optString("access_token"),
            refreshToken = sessionJson.optString("refresh_token"),
            expiresAt = sessionJson.optLong("expires_at").takeIf { it > 0L },
            expiresIn = sessionJson.optLong("expires_in").takeIf { it > 0L },
            tokenType = sessionJson.optString("token_type").takeIf { it.isNotBlank() },
            userId = user?.optString("id")?.takeIf { it.isNotBlank() },
            email = user?.optString("email")?.takeIf { it.isNotBlank() } ?: email,
            rememberSession = rememberSession
        ).takeIf { it.accessToken.isNotBlank() && it.refreshToken.isNotBlank() }
            ?: throw SupabaseAuthException(
                userMessage = "Respons login tidak lengkap dari server.",
                errorRef = buildErrorRef("LOGIN_PARSE")
            )

        val bootstrapCookie = response.headers.entries.firstOrNull {
            it.key.equals("Set-Cookie", ignoreCase = true)
        }?.value

        return NativeLoginResult(session = session, bootstrapCookie = bootstrapCookie)
    }

    fun sendRegistrationOtp(email: String): NativeOtpDispatchResult {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildFunctionUrl("send-registration-otp"),
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
        )

        if (!response.isSuccessful) {
            throw createApiError("REGOTP", response.statusCode, response.body)
        }

        val json = JSONObject(response.body)
        return NativeOtpDispatchResult(
            destination = json.optString("email").takeIf { it.isNotBlank() },
            message = json.optString("message").ifBlank { "Kode OTP telah dikirim." }
        )
    }

    fun verifyRegistrationOtp(
        email: String,
        otp: String,
        name: String,
        whatsapp: String,
        address: String,
        password: String
    ) {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildFunctionUrl("verify-registration-otp"),
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("otp", otp.trim())
                .put("name", name.trim())
                .put("whatsapp", whatsapp.trim())
                .put("address", address.trim())
                .put("password", password)
        )

        if (!response.isSuccessful) {
            throw createApiError("REGVERIFY", response.statusCode, response.body)
        }
    }

    fun fetchInvitation(invitationCode: String): NativeInvitationData {
        requireConfigured()

        val endpoint = buildRestUrl("rpc/validate_invitation_code")

        val response = executeJsonRequest(
            method = "POST",
            endpoint = endpoint,
            requestBody = JSONObject().put("p_invitation_code", invitationCode.trim())
        )
        if (!response.isSuccessful) {
            throw createApiError("INVITE_LOOKUP", response.statusCode, response.body)
        }

        val array = JSONArray(response.body)
        if (array.length() == 0) {
            throw SupabaseAuthException(
                userMessage = "Kode undangan tidak ditemukan atau sudah digunakan.",
                errorRef = buildErrorRef("INVITE_NOT_FOUND")
            )
        }

        return parseInvitationLookupPayload(
            json = array.getJSONObject(0),
            invitationCode = invitationCode,
            errorRefBuilder = ::buildErrorRef
        )
    }

    fun registerWithInvitation(
        invitation: NativeInvitationData,
        name: String,
        email: String,
        password: String
    ) {
        requireConfigured()

        val authResponse = executeJsonRequest(
            method = "POST",
            endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/signup",
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("password", password)
                .put("data", JSONObject().put("name", name.trim()))
        )

        if (!authResponse.isSuccessful) {
            throw createAuthError("INVITE_SIGNUP", authResponse.statusCode, authResponse.body)
        }

        val authJson = JSONObject(authResponse.body)
        authJson.optJSONObject("user")?.optString("id")
            ?.takeIf { it.isNotBlank() }
            ?: throw SupabaseAuthException(
                userMessage = "Registrasi berhasil dibuat tetapi user ID tidak ditemukan.",
                errorRef = buildErrorRef("INVITE_USER_ID")
            )
        val sessionAccessToken = authJson.optString("access_token").takeIf { it.isNotBlank() }
            ?: throw SupabaseAuthException(
                userMessage = "Registrasi berhasil dibuat tetapi sesi user belum tersedia.",
                errorRef = buildErrorRef("INVITE_SESSION")
            )

        val joinResponse = executeJsonRequest(
            method = "POST",
            endpoint = buildFunctionUrl("join-organization"),
            requestBody = JSONObject().put("invitation_code", invitation.invitationCode),
            authBearerToken = sessionAccessToken
        )

        if (!joinResponse.isSuccessful) {
            throw createApiError("INVITE_JOIN", joinResponse.statusCode, joinResponse.body)
        }
    }

    fun registerOrganization(data: NativeOrganizationRegistrationData) {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/signup",
            requestBody = JSONObject()
                .put("email", data.email.trim().lowercase())
                .put("password", data.password)
                .put(
                    "data",
                    JSONObject()
                        .put("name", data.name.trim())
                        .put("tenant_name", data.organizationName.trim())
                        .put("organization_type", data.organizationType)
                        .put("tenant_office_name", data.officeName.trim())
                        .put("tenant_office_address", data.officeAddress.trim())
                        .put("tenant_office_latitude", data.officeLatitude.trim())
                        .put("tenant_office_longitude", data.officeLongitude.trim())
                        .put("whatsapp", data.whatsapp.trim())
                )
        )

        if (!response.isSuccessful) {
            throw createAuthError("ORG_SIGNUP", response.statusCode, response.body)
        }
    }

    fun validateResetIdentity(email: String, whatsapp: String, loginType: String): NativeIdentityValidationResult {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildMobileAuthUrl("forgot-password/request"),
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("whatsapp", whatsapp.trim())
                .put("validate_only", true)
                .put("login_type", loginType),
            useSupabaseHeaders = false
        )

        if (!response.isSuccessful) {
            throw createApiError("RESET_VALIDATE", response.statusCode, response.body)
        }

        val json = JSONObject(response.body)
        return NativeIdentityValidationResult(
            name = json.optString("name").takeIf { it.isNotBlank() },
            message = json.optString("message").ifBlank { "Data tervalidasi." }
        )
    }

    fun sendNewPassword(
        email: String,
        whatsapp: String,
        method: String,
        loginType: String
    ): String {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildMobileAuthUrl("forgot-password/reset"),
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("whatsapp", whatsapp.trim())
                .put("method", method)
                .put("login_type", loginType),
            useSupabaseHeaders = false
        )

        if (!response.isSuccessful) {
            throw createApiError("RESET_SEND", response.statusCode, response.body)
        }

        return JSONObject(response.body).optString("message").ifBlank {
            "Instruksi reset password dikirim."
        }
    }

    fun sendPasswordOtp(
        email: String,
        whatsapp: String,
        method: String,
        loginType: String
    ): NativeOtpDispatchResult {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildMobileAuthUrl("forgot-password/request"),
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("whatsapp", whatsapp.trim())
                .put("method", method)
                .put("purpose", "password_change")
                .put("login_type", loginType)
                .put("use_otp", true),
            useSupabaseHeaders = false
        )

        if (!response.isSuccessful) {
            throw createApiError("PASSOTP", response.statusCode, response.body)
        }

        val json = JSONObject(response.body)
        val destination = json.optString("email").takeIf { it.isNotBlank() }
            ?: json.optString("whatsapp").takeIf { it.isNotBlank() }

        return NativeOtpDispatchResult(
            destination = destination,
            message = json.optString("message").ifBlank { "Kode OTP telah dikirim." }
        )
    }

    fun verifyPasswordOtp(email: String, otp: String, newPassword: String) {
        requireConfigured()

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildMobileAuthUrl("forgot-password/verify-otp"),
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("otp", otp.trim())
                .put("new_password", newPassword),
            useSupabaseHeaders = false
        )

        if (!response.isSuccessful) {
            throw createApiError("PASSOTP_VERIFY", response.statusCode, response.body)
        }
    }

    fun sendPasswordRecovery(email: String, redirectTo: String) {
        requireConfigured()

        val encodedRedirect = URLEncoder.encode(redirectTo, Charsets.UTF_8.name())
        val endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/recover?redirect_to=$encodedRedirect"
        val response = executeJsonRequest(
            method = "POST",
            endpoint = endpoint,
            requestBody = JSONObject()
                .put("email", email.trim().lowercase())
                .put("gotrue_meta_security", JSONObject())
        )

        if (!response.isSuccessful) {
            throw createApiError("RECOVERY", response.statusCode, response.body)
        }
    }

    fun fetchTenantInfo(tenantId: String, authBearerToken: String? = null): TenantInfo {
        requireConfigured()

        val endpoint = buildRestUrl("tenants", mapOf("id" to "eq.$tenantId"))

        val response = executeJsonRequest(
            method = "GET",
            endpoint = endpoint,
            requestBody = null,
            authBearerToken = authBearerToken
        )

        if (!response.isSuccessful) {
            throw createApiError("TENANT_FETCH", response.statusCode, response.body)
        }

        val array = JSONArray(response.body)
        if (array.length() == 0) {
            throw SupabaseAuthException(
                userMessage = "Data organisasi tidak ditemukan.",
                errorRef = buildErrorRef("TENANT_NOT_FOUND")
            )
        }

        val json = array.getJSONObject(0)
        return TenantInfo(
            id = json.optString("id"),
            name = json.optString("name"),
            code = json.optString("code").takeIf { it.isNotBlank() },
            logoUrl = json.optString("logo_url").takeIf { it.isNotBlank() }
        )
    }

    fun fetchTenantInfoByEmployeeId(userId: String, authBearerToken: String): TenantInfo? {
        requireConfigured()

        val endpoint = buildRestUrl(
            "employees",
            mapOf("user_id" to "eq.$userId")
        )

        val response = executeJsonRequest(
            method = "GET",
            endpoint = endpoint,
            requestBody = null,
            authBearerToken = authBearerToken
        )

        if (!response.isSuccessful) {
            return null
        }

        val array = JSONArray(response.body)
        if (array.length() == 0) {
            return null
        }

        val json = array.getJSONObject(0)
        val tenantId = json.optString("tenant_id").takeIf { it.isNotBlank() } ?: return null

        return fetchTenantInfo(tenantId, authBearerToken = authBearerToken)
    }

    fun syncDevicePushToken(
        authSession: NativeAuthSession,
        installationId: String,
        fcmToken: String?,
        deviceId: String,
        deviceModel: String,
        appVersion: String,
        notificationPermissionState: String,
        appCode: String,
        active: Boolean
    ) {
        requireConfigured()

        val normalizedInstallationId = installationId.trim()
        if (normalizedInstallationId.isBlank()) {
            throw SupabaseAuthException(
                userMessage = "Identitas instalasi perangkat belum tersedia.",
                errorRef = buildErrorRef("PUSH_INSTALLATION")
            )
        }

        val normalizedToken = fcmToken?.trim().orEmpty()
        if (active && normalizedToken.isBlank()) {
            throw SupabaseAuthException(
                userMessage = "Token push perangkat belum tersedia.",
                errorRef = buildErrorRef("PUSH_TOKEN")
            )
        }

        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildFunctionUrl("register-device-push-token"),
            requestBody = JSONObject()
                .put("installation_id", normalizedInstallationId)
                .put("fcm_token", if (normalizedToken.isBlank()) JSONObject.NULL else normalizedToken)
                .put("device_id", deviceId.trim())
                .put("device_model", deviceModel.trim())
                .put("app_version", appVersion.trim())
                .put("notification_permission", notificationPermissionState.trim())
                .put("app_code", appCode.trim())
                .put("active", active),
            authBearerToken = authSession.accessToken
        )

        if (!response.isSuccessful) {
            throw createApiError("PUSH_SYNC", response.statusCode, response.body)
        }
    }

    private fun patchRestRow(
        table: String,
        filters: Map<String, String>,
        body: JSONObject,
        authBearerToken: String? = null
    ) {
        val response = executeJsonRequest(
            method = "PATCH",
            endpoint = buildRestUrl(table, filters),
            requestBody = body,
            extraHeaders = mapOf("Prefer" to "return=minimal"),
            authBearerToken = authBearerToken
        )

        if (!response.isSuccessful) {
            throw createApiError("REST_PATCH", response.statusCode, response.body)
        }
    }

    private fun insertRestRow(
        table: String,
        body: JSONObject,
        authBearerToken: String? = null
    ) {
        val response = executeJsonRequest(
            method = "POST",
            endpoint = buildRestUrl(table),
            requestBody = body,
            extraHeaders = mapOf("Prefer" to "return=minimal"),
            authBearerToken = authBearerToken
        )

        if (!response.isSuccessful) {
            throw createApiError("REST_INSERT", response.statusCode, response.body)
        }
    }

    private fun buildFunctionUrl(functionName: String): String {
        return "${supabaseUrl.trimEnd('/')}/functions/v1/$functionName"
    }

    private fun buildMobileAuthUrl(path: String): String {
        return "${webBaseUrl.trimEnd('/')}/mobile-api/auth/${path.trimStart('/')}"
    }

    private fun buildRestUrl(table: String, filters: Map<String, String> = emptyMap()): String {
        val query = buildString {
            filters.entries.forEachIndexed { index, entry ->
                if (index > 0) append("&")
                append(URLEncoder.encode(entry.key, Charsets.UTF_8.name()))
                append("=")
                append(URLEncoder.encode(entry.value, Charsets.UTF_8.name()))
            }
        }
        return if (query.isBlank()) {
            "${supabaseUrl.trimEnd('/')}/rest/v1/$table"
        } else {
            "${supabaseUrl.trimEnd('/')}/rest/v1/$table?$query"
        }
    }

    private fun executeJsonRequest(
        method: String,
        endpoint: String,
        requestBody: JSONObject? = null,
        extraHeaders: Map<String, String> = emptyMap(),
        useSupabaseHeaders: Boolean = true,
        authBearerToken: String? = null
    ): NetworkResponse {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            doInput = true
            doOutput = requestBody != null
            setRequestMethodCompat(method)
            buildRequestHeaders(
                publishableKey = publishableKey,
                useSupabaseHeaders = useSupabaseHeaders,
                authBearerToken = authBearerToken,
                extraHeaders = extraHeaders
            ).applyTo(this)
            setRequestProperty("Accept", "application/json")
            if (requestBody != null) {
                setRequestProperty("Content-Type", "application/json")
            }
        }

        return try {
            if (requestBody != null) {
                connection.outputStream.use { stream ->
                    stream.write(requestBody.toString().toByteArray(Charsets.UTF_8))
                }
            }

            NetworkResponse(
                statusCode = connection.responseCode,
                body = readResponseBody(connection),
                headers = extractHeaders(connection)
            )
        } catch (error: SupabaseAuthException) {
            throw error
        } catch (error: Exception) {
            Log.e(TAG, "Request failed [$method $endpoint]", error)
            throw SupabaseAuthException(
                userMessage = "Tidak dapat menghubungi server.",
                errorRef = buildErrorRef("NETWORK"),
                cause = error
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun HttpURLConnection.setRequestMethodCompat(method: String) {
        try {
            requestMethod = method
            return
        } catch (error: ProtocolException) {
            if (method != "PATCH") throw error
        }

        requestMethod = "POST"
        setRequestProperty("X-HTTP-Method-Override", method)
    }

    private fun createAuthError(prefix: String, statusCode: Int, responseBody: String): SupabaseAuthException {
        val json = parseJson(responseBody)
        val message = json.extractMessage()
        val userMessage = when {
            statusCode == 400 && message.contains("Invalid login credentials", ignoreCase = true) ->
                "Email atau password salah."
            statusCode == 400 && message.contains("Email not confirmed", ignoreCase = true) ->
                "Email belum dikonfirmasi. Selesaikan aktivasi akun terlebih dahulu."
            statusCode == 422 && message.contains("already registered", ignoreCase = true) ->
                "Email sudah terdaftar."
            statusCode == 429 ->
                "Terlalu banyak percobaan. Coba lagi beberapa saat."
            message.isNotBlank() -> message
            else -> "Permintaan otentikasi gagal dengan kode $statusCode."
        }

        return SupabaseAuthException(
            userMessage = userMessage,
            errorRef = json.extractTraceOr(buildErrorRef(prefix))
        )
    }

    private fun createApiError(prefix: String, statusCode: Int, responseBody: String): SupabaseAuthException {
        val json = parseJson(responseBody)
        val message = json.extractMessage().ifBlank { "Permintaan gagal dengan kode $statusCode." }
        val userMessage = when (statusCode) {
            429 -> "Terlalu banyak percobaan. Coba lagi beberapa saat."
            else -> message
        }
        return SupabaseAuthException(
            userMessage = userMessage,
            errorRef = json.extractTraceOr(buildErrorRef(prefix))
        )
    }

    private fun parseJson(raw: String): JSONObject {
        return runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
    }

    private fun JSONObject.extractMessage(): String {
        return listOf(
            optString("error"),
            optString("message"),
            optString("msg"),
            optString("error_description")
        ).firstOrNull { it.isNotBlank() }.orEmpty()
    }

    private fun JSONObject.extractTraceOr(fallback: String): String {
        return listOf(
            optString("trace_id"),
            optString("ref_id"),
            optString("errorRef"),
            optString("code")
        ).firstOrNull { it.isNotBlank() } ?: fallback
    }

    private fun extractHeaders(connection: HttpURLConnection): Map<String, String> {
        val headers = mutableMapOf<String, String>()
        connection.headerFields?.forEach { (key, values) ->
            if (key != null && !values.isNullOrEmpty()) {
                headers[key] = values.joinToString(", ")
            }
        }
        return headers
    }

    private fun readResponseBody(connection: HttpURLConnection): String {
        val stream = connection.errorStream ?: connection.inputStream
        return BufferedReader(InputStreamReader(stream)).use { reader ->
            buildString {
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    append(line)
                }
            }
        }
    }

    private fun requireConfigured() {
        require(supabaseUrl.isNotBlank()) { "Supabase URL belum dikonfigurasi." }
        require(publishableKey.isNotBlank()) { "Supabase publishable key belum dikonfigurasi." }
        require(webBaseUrl.isNotBlank()) { "Web base URL belum dikonfigurasi." }
    }

    private fun buildErrorRef(prefix: String): String {
        return "APK-LOGIN-$prefix-${System.currentTimeMillis()}"
    }

    private fun isoNow(): String {
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
    }

    private data class NetworkResponse(
        val statusCode: Int,
        val body: String,
        val headers: Map<String, String>
    ) {
        val isSuccessful: Boolean
            get() = statusCode in 200..299
    }

    companion object {
        private const val TAG = "SupabaseAuthService"
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val READ_TIMEOUT_MS = 60_000

        internal fun buildRequestHeaders(
            publishableKey: String,
            useSupabaseHeaders: Boolean,
            authBearerToken: String?,
            extraHeaders: Map<String, String>
        ): RequestHeaders {
            if (!useSupabaseHeaders) {
                return RequestHeaders(
                    apikey = null,
                    authorization = extraHeaders["Authorization"],
                    extras = extraHeaders.filterKeys { !it.equals("Authorization", ignoreCase = true) }
                )
            }

            val authorizationValue = authBearerToken?.let { "Bearer $it" }
                ?: extraHeaders.entries.firstOrNull { it.key.equals("Authorization", ignoreCase = true) }?.value
                ?: "Bearer $publishableKey"

            return RequestHeaders(
                apikey = publishableKey,
                authorization = authorizationValue,
                extras = extraHeaders.filterKeys { !it.equals("Authorization", ignoreCase = true) }
            )
        }
    }

    private fun RequestHeaders.applyTo(connection: HttpURLConnection) {
        apikey?.let { connection.setRequestProperty("apikey", it) }
        authorization?.let { connection.setRequestProperty("Authorization", it) }
        extras.forEach { (key, value) ->
            connection.setRequestProperty(key, value)
        }
    }
}

internal fun parseInvitationLookupPayload(
    json: JSONObject,
    invitationCode: String,
    errorRefBuilder: (String) -> String
): NativeInvitationData {
    return toNativeInvitationData(
        payload = NativeInvitationLookupPayload(
            id = json.optNormalizedString("id"),
            tenantId = json.optNormalizedString("tenant_id"),
            tenantName = json.optNormalizedString("tenant_name"),
            tenantCode = json.optNormalizedString("tenant_code"),
            tenantLogoUrl = json.optNormalizedString("tenant_logo_url"),
            name = json.optNormalizedString("name"),
            email = json.optNormalizedString("email"),
            phone = json.optNormalizedString("phone"),
            nik = json.optNormalizedString("nik"),
            opdId = json.optNormalizedString("opd_id"),
            officeId = json.optNormalizedString("office_id"),
            validationStatus = json.optNormalizedString("validation_status")
        ),
        invitationCode = invitationCode,
        errorRefBuilder = errorRefBuilder
    )
}

internal fun toNativeInvitationData(
    payload: NativeInvitationLookupPayload,
    invitationCode: String,
    errorRefBuilder: (String) -> String
): NativeInvitationData {
    val normalizedCode = invitationCode.trim()
    if (normalizedCode.isBlank()) {
        throw SupabaseAuthException(
            userMessage = "Kode undangan wajib diisi.",
            errorRef = errorRefBuilder("INVITE_REQUIRED")
        )
    }

    val validationStatus = payload.validationStatus ?: "invalid"
    when (validationStatus) {
        "invalid", "used" -> {
            throw SupabaseAuthException(
                userMessage = "Kode undangan tidak ditemukan atau sudah digunakan.",
                errorRef = errorRefBuilder("INVITE_NOT_FOUND")
            )
        }
        "expired" -> {
            throw SupabaseAuthException(
                userMessage = "Masa berlaku undangan sudah habis. Minta admin mengirim ulang undangan.",
                errorRef = errorRefBuilder("INVITE_EXPIRED")
            )
        }
    }

    val id = payload.id
        ?: throw SupabaseAuthException(
            userMessage = "Data undangan tidak lengkap. Coba lagi atau minta admin mengirim ulang undangan.",
            errorRef = errorRefBuilder("INVITE_MALFORMED")
        )
    val tenantId = payload.tenantId
        ?: throw SupabaseAuthException(
            userMessage = "Data organisasi dari undangan tidak lengkap. Minta admin mengirim ulang undangan.",
            errorRef = errorRefBuilder("INVITE_TENANT_MISSING")
        )

    return NativeInvitationData(
        id = id,
        tenantId = tenantId,
        tenantName = payload.tenantName,
        tenantCode = payload.tenantCode,
        tenantLogoUrl = payload.tenantLogoUrl,
        invitationCode = normalizedCode,
        name = payload.name,
        email = payload.email,
        nik = payload.nik.orEmpty(),
        phone = payload.phone,
        opdId = payload.opdId,
        officeId = payload.officeId,
        validationStatus = validationStatus
    )
}

internal fun JSONObject.optNormalizedString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    val value = optString(key, "").trim()
    if (value.isBlank()) return null
    if (value.equals("null", ignoreCase = true)) return null
    return value
}
