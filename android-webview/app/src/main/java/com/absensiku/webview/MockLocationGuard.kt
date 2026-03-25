package com.absensiku.webview

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.util.Log
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.util.concurrent.atomic.AtomicBoolean

class MockLocationGuard(
    private val context: Context,
    private val onBlocked: (String) -> Unit
) {
    private val tag = "MockLocationGuard"
    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private var blocked = false
    private var started = false
    private val staticCheckStarted = AtomicBoolean(false)

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            if (blocked) return
            val location = result.lastLocation ?: return
            if (isMockLocation(location)) {
                block("Lokasi palsu terdeteksi pada perangkat.")
            }
        }
    }

    fun start() {
        if (started || blocked) return
        started = true

        // Hindari binder call PackageManager/Settings di main thread (rawan jank/ANR di device lambat).
        if (staticCheckStarted.compareAndSet(false, true)) {
            Thread {
                runCatching { staticBlockReason() }
                    .getOrNull()
                    ?.let { reason -> block(reason) }
            }.start()
        }

        if (!hasLocationPermission()) {
            return
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
            .setMinUpdateIntervalMillis(5_000L)
            .build()

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, context.mainLooper)
        } catch (e: SecurityException) {
            Log.e(tag, "Location permission missing while requesting updates", e)
        }
    }

    fun stop() {
        if (!started) return
        started = false
        fusedClient.removeLocationUpdates(locationCallback)
    }

    fun reset() {
        blocked = false
    }

    private fun block(reason: String) {
        if (blocked) return
        blocked = true
        stop()
        onBlocked(reason)
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun staticBlockReason(): String? {
        if (hasSelectedMockLocationApp()) {
            return "Mock location app aktif pada pengaturan developer."
        }

        if (hasKnownFakeGpsApps()) {
            return "Aplikasi Fake GPS terdeteksi di perangkat."
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.JELLY_BEAN_MR2 && isLegacyMockEnabled()) {
            return "Pengaturan mock location aktif pada perangkat."
        }

        return null
    }

    private fun hasSelectedMockLocationApp(): Boolean {
        val selected = Settings.Secure.getString(context.contentResolver, "mock_location_app")
        return !selected.isNullOrBlank()
    }

    private fun isLegacyMockEnabled(): Boolean {
        val value = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ALLOW_MOCK_LOCATION
        )
        return value != null && value != "0"
    }

    private fun hasKnownFakeGpsApps(): Boolean {
        val knownPackages = setOf(
            "com.lexa.fakegps",
            "com.incorporateapps.fakegps.fre",
            "com.fakegpslocation",
            "com.blogspot.newapphorizons.fakegps",
            "com.evezzon.fakegps"
        )

        return knownPackages.any { packageName ->
            try {
                context.packageManager.getPackageInfo(packageName, 0)
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    private fun isMockLocation(location: Location): Boolean {
        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> location.isMock
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2 -> location.isFromMockProvider
            else -> false
        }
    }
}
