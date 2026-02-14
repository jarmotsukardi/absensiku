package com.absensiku.webview

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.net.URI

class MainActivity : AppCompatActivity() {
    private lateinit var rootContainer: FrameLayout
    private lateinit var webView: WebView
    private lateinit var blockPanel: LinearLayout
    private lateinit var blockReason: TextView
    private lateinit var retryButton: Button

    private var geoCallback: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null

    private val TAG = "AbsensikuWebView"
    private val targetUrl = "https://absensiku-alpha.vercel.app/employee/login"
    private val allowedHost = "absensiku-alpha.vercel.app"

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true

        geoCallback?.invoke(geoOrigin, granted, false)
        geoCallback = null
        geoOrigin = null

        if (granted) {
            guard.start()
        }
    }

    private val guard: MockLocationGuard by lazy {
        MockLocationGuard(this) { reason ->
            runOnUiThread { showBlocked(reason) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        rootContainer = findViewById(R.id.rootContainer)
        webView = findViewById(R.id.webView)
        blockPanel = findViewById(R.id.blockPanel)
        blockReason = findViewById(R.id.blockReason)
        retryButton = findViewById(R.id.retryButton)
        applySystemInsets()

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.mediaPlaybackRequiresUserGesture = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setGeolocationEnabled(true)
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.setSupportMultipleWindows(false)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url.isNullOrBlank()) return true
                return !isAllowedUrl(url)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "Main frame load error: ${error?.description}")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (callback == null || origin.isNullOrBlank()) return
                if (!isAllowedUrl(origin)) {
                    callback.invoke(origin, false, false)
                    return
                }

                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                    return
                }

                geoCallback = callback
                geoOrigin = origin
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }
        }

        retryButton.setOnClickListener {
            blockPanel.visibility = View.GONE
            guard.reset()
            if (hasLocationPermission()) {
                guard.start()
            } else {
                requestLocationPermission()
            }
            webView.loadUrl(targetUrl)
        }

        if (!hasLocationPermission()) {
            requestLocationPermission()
        }

        webView.loadUrl(targetUrl)
    }

    override fun onResume() {
        super.onResume()
        guard.start()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        guard.stop()
        super.onPause()
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    private fun requestLocationPermission() {
        locationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun showBlocked(reason: String) {
        blockReason.text = reason
        blockPanel.visibility = View.VISIBLE
        webView.stopLoading()
    }

    private fun applySystemInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                systemBars.bottom
            )
            insets
        }
        ViewCompat.requestApplyInsets(rootContainer)
    }

    private fun isAllowedUrl(url: String): Boolean {
        return try {
            val uri = URI(url)
            uri.scheme == "https" && uri.host.equals(allowedHost, ignoreCase = true)
        } catch (_: Exception) {
            false
        }
    }
}
