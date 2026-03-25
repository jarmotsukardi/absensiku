package com.absensiku.webview

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.util.Log
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPasswordOption
import androidx.credentials.PasswordCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException

data class NativeSavedCredential(
    val email: String,
    val password: String
)

class NativeCredentialException(
    val userMessage: String,
    cause: Throwable? = null
) : Exception(userMessage, cause)

class NativeCredentialManager(context: Context) {
    private val credentialManager = CredentialManager.create(context.applicationContext)

    suspend fun savePasswordCredential(activity: Activity, email: String, password: String): Boolean {
        val normalizedEmail = email.trim().lowercase()
        if (normalizedEmail.isBlank() || password.isBlank()) return false

        return try {
            credentialManager.createCredential(
                context = activity,
                request = CreatePasswordRequest(
                    id = normalizedEmail,
                    password = password
                )
            )
            true
        } catch (_: CreateCredentialCancellationException) {
            false
        } catch (error: CreateCredentialException) {
            Log.w(TAG, "Saving native credential failed.", error)
            false
        }
    }

    suspend fun getSavedPasswordCredential(activity: Activity): NativeSavedCredential? {
        return try {
            val response = credentialManager.getCredential(
                context = activity,
                request = GetCredentialRequest.Builder()
                    .addCredentialOption(
                        GetPasswordOption(
                            allowedUserIds = emptySet<String>(),
                            isAutoSelectAllowed = false,
                            allowedProviders = emptySet<ComponentName>()
                        )
                    )
                    .build()
            )

            val credential = response.credential
            if (credential is PasswordCredential) {
                NativeSavedCredential(
                    email = credential.id,
                    password = credential.password
                )
            } else {
                null
            }
        } catch (_: NoCredentialException) {
            null
        } catch (_: GetCredentialCancellationException) {
            null
        } catch (error: GetCredentialException) {
            throw NativeCredentialException(
                userMessage = "Gagal mengambil akun tersimpan dari penyedia kredensial.",
                cause = error
            )
        }
    }

    companion object {
        private const val TAG = "NativeCredentialMgr"
    }
}
