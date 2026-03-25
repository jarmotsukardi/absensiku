package com.absensiku.webview

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.os.SystemClock
import android.text.InputType
import android.util.Base64
import android.util.Log
import android.util.Patterns
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.google.android.material.tabs.TabLayout
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.android.material.textfield.MaterialAutoCompleteTextView
import com.absensiku.webview.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URI
import java.net.URLEncoder
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

class MainActivity : AppCompatActivity() {
    private enum class AuthTab { LOGIN, REGISTER }
    private enum class RecoveryAction { FORGOT, CHANGE }
    private enum class WebSessionClearMode { BOOTSTRAP, FULL }
    private enum class DeliveryMethod(val apiValue: String, val label: String) {
        EMAIL("email", "Email"),
        WHATSAPP("whatsapp", "WhatsApp")
    }

    private data class OrganizationTypeOption(
        val label: String,
        val value: String
    )

    private lateinit var binding: ActivityMainBinding

    private var geoCallback: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null
    private val bootstrapSessionState = BootstrapSessionState()
    private var isSubmittingLogin = false
    private var isLoadingSavedCredential = false
    private var isRunningDebugStress = false
    private var webConnectionIssueVisible = false
    private var networkCallbackRegistered = false
    private var webView: WebView? = null
    private var activeAuthSession: NativeAuthSession? = null
    private var pendingNotificationTargetUrl: String? = null

    private val TAG = "AbsensikuWebView"
    private val EXTRA_DEBUG_STRESS = "debug_stress"
    private val EXTRA_DEBUG_STRESS_ITER = "debug_stress_iter"
    private val webBaseUrl = BuildConfig.WEB_BASE_URL.trimEnd('/')
    private val bootstrapUrl = "$webBaseUrl/employee/native-bootstrap"
    private val employeeDashboardUrl = "$webBaseUrl/employee/dashboard"
    private val allowedHost = BuildConfig.WEB_ALLOWED_HOST
    private val organizationTypeOptions = listOf(
        OrganizationTypeOption("Pemerintah Daerah", "pemerintah_daerah"),
        OrganizationTypeOption("Instansi Pemerintah", "instansi_pemerintah"),
        OrganizationTypeOption("Perusahaan", "perusahaan"),
        OrganizationTypeOption("Sekolah", "sekolah")
    )

    private val sessionStore: NativeSessionStore by lazy {
        NativeSessionStore(this)
    }

    @Volatile
    private var rememberEnabledCache: Boolean = false

    private val authService: SupabaseAuthService by lazy {
        SupabaseAuthService(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            publishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
            webBaseUrl = BuildConfig.WEB_BASE_URL
        )
    }

    private val nativeCredentialManager: NativeCredentialManager by lazy {
        NativeCredentialManager(this)
    }

    private val connectivityManager: ConnectivityManager by lazy {
        getSystemService(ConnectivityManager::class.java)
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            runOnUiThread { handleNetworkAvailabilityChanged(true) }
        }

        override fun onLost(network: Network) {
            runOnUiThread { handleNetworkAvailabilityChanged(hasInternetConnection()) }
        }

        override fun onUnavailable() {
            runOnUiThread { handleNetworkAvailabilityChanged(false) }
        }
    }

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

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val permissionState = if (granted) "granted" else FcmRuntime.currentPermissionState(this)
        sessionStore.setPushPermissionState(permissionState)
        syncPushTokenForActiveSession(force = true)
    }

    private val guard: MockLocationGuard by lazy {
        MockLocationGuard(this) { reason ->
            runOnUiThread { showBlocked(reason) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applySystemInsets()
        setupLoginPanel()
        FcmRuntime.ensureNotificationChannel(this)
        handleNotificationIntent(intent)

        if (!hasLocationPermission()) {
            requestLocationPermission()
        }

        attemptStartupAsync()

        if (BuildConfig.DEBUG && intent?.getBooleanExtra(EXTRA_DEBUG_STRESS, false) == true) {
            val iterations = intent?.getIntExtra(EXTRA_DEBUG_STRESS_ITER, 10) ?: 10
            binding.rootContainer.post { runDebugStress(iterations) }
        }
    }

    override fun onResume() {
        super.onResume()
        registerNetworkCallbackIfNeeded()
        guard.start()
        webView?.onResume()
        handleNetworkAvailabilityChanged(hasInternetConnection())
        maybeLoadPendingNotificationTarget()
    }

    override fun onPause() {
        webView?.onPause()
        guard.stop()
        unregisterNetworkCallbackIfNeeded()
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val currentWebView = webView
        if (currentWebView != null && binding.webRefreshLayout.visibility == View.VISIBLE) {
            if (currentWebView.canGoBack()) {
                currentWebView.goBack()
                return
            }
        }

        super.onBackPressed()
    }

    override fun onDestroy() {
        unregisterNetworkCallbackIfNeeded()
        val currentWebView = webView
        if (currentWebView != null) {
            currentWebView.stopLoading()
            (currentWebView.parent as? ViewGroup)?.removeView(currentWebView)
            currentWebView.destroy()
            webView = null
        }
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNotificationIntent(intent)
    }

    private fun ensureWebViewCreated(): WebView {
        webView?.let { return it }

        val created = WebView(this)
        created.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        binding.webViewContainer.removeAllViews()
        binding.webViewContainer.addView(created)
        setupWebView(created)
        webView = created
        return created
    }

    private fun setupLoginPanel() {
        // Load cached tenant info di background supaya EncryptedSharedPreferences tidak nge-block UI thread.
        loadCachedTenantInfo()

        binding.tenantNameText.text = BuildConfig.TENANT_DISPLAY_NAME
        binding.versionText.text = getString(R.string.login_version, BuildConfig.VERSION_NAME)
        replaceInputText(binding.emailEdit, "")
        binding.rememberSessionCheck.isChecked = false

        binding.authTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                showAuthTab(if (tab.position == 0) AuthTab.LOGIN else AuthTab.REGISTER)
            }

            override fun onTabUnselected(tab: TabLayout.Tab) = Unit

            override fun onTabReselected(tab: TabLayout.Tab) = Unit
        })

        binding.loginButton.setOnClickListener {
            submitNativeLogin()
        }

        binding.useSavedCredentialButton.setOnClickListener {
            requestSavedCredential()
        }

        binding.forgotPasswordButton.setOnClickListener {
            openForgotPasswordDialog()
        }

        if (BuildConfig.DEBUG) {
            binding.debugStressButton.visibility = View.VISIBLE
            binding.debugStressButton.setOnClickListener {
                handleDebugLoginShortcut()
            }
            binding.debugStressButton.setOnLongClickListener {
                runDebugStress(10)
                true
            }
        }

        binding.registerEmailButton.setOnClickListener { openSelfRegistrationStartDialog() }
        binding.registerInviteButton.setOnClickListener { openInviteLookupDialog() }
        binding.registerOrganizationButton.setOnClickListener { openOrganizationRegistrationInfoDialog() }
        binding.registerHelpButton.setOnClickListener { openRegisterHelpDialog() }
        binding.switchToLoginButton.setOnClickListener {
            binding.authTabs.getTabAt(0)?.select()
        }

        binding.retryButton.setOnClickListener {
            binding.blockPanel.visibility = View.GONE
            guard.reset()
            if (!hasLocationPermission()) {
                requestLocationPermission()
            } else {
                guard.start()
            }
            attemptStartupAsync()
        }

        binding.webConnectionRetryButton.setOnClickListener {
            retryWebViewAfterConnectionIssue()
        }

        showAuthTab(AuthTab.LOGIN)

        // Hydrate field dari storage di background supaya startup tidak nge-freeze.
        lifecycleScope.launch {
            val (lastEmail, rememberEnabled) = withContext(Dispatchers.IO) {
                sessionStore.getLastEmail() to sessionStore.isRememberEnabled()
            }
            rememberEnabledCache = rememberEnabled
            replaceInputText(binding.emailEdit, lastEmail.takeIf { rememberEnabled }.orEmpty())
            binding.rememberSessionCheck.isChecked = rememberEnabled
            if (!rememberEnabled && lastEmail.isNotBlank()) {
                lifecycleScope.launch(Dispatchers.IO) { sessionStore.clearLastEmail() }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView(webView: WebView) {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        binding.webRefreshLayout.setOnRefreshListener {
            webConnectionIssueVisible = false
            hideWebConnectionStatus()
            reloadCurrentWebView()
        }
        binding.webRefreshLayout.setColorSchemeColors(
            ContextCompat.getColor(this, android.R.color.holo_blue_dark)
        )

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
        settings.userAgentString = "${settings.userAgentString} AbsensiKuNative/1.0"

        webView.addJavascriptInterface(HybridBridge(), "Android")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                return handleUrlOverride(request?.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return handleUrlOverride(url?.let(Uri::parse))
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "Main frame load error: ${error?.description}")
                    if (shouldHandleAsConnectionIssue(error)) {
                        view?.stopLoading()
                        view?.loadUrl("about:blank")
                        if (bootstrapSessionState.hasPendingSession() || bootstrapSessionState.wasConsumed()) {
                            binding.loginPanel.visibility = View.GONE
                            binding.webRefreshLayout.visibility = View.VISIBLE
                            updateSwipeRefreshAvailability()
                        }
                        showWebConnectionStatus(error)
                    } else if (bootstrapSessionState.hasPendingSession()) {
                        showBootstrapFailure(getString(R.string.login_error_bootstrap_failed))
                    }
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                binding.webRefreshLayout.isRefreshing = false
                if (!bootstrapSessionState.hasPendingSession()) {
                    binding.loadingPanel.visibility = View.GONE
                }
                if (webConnectionIssueVisible && !url.isNullOrBlank() && url != "about:blank") {
                    hideWebConnectionStatus()
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
                requestLocationPermission()
            }
        }
    }

    private fun showAuthTab(tab: AuthTab) {
        val isLogin = tab == AuthTab.LOGIN
        binding.loginFormContainer.visibility = if (isLogin) View.VISIBLE else View.GONE
        binding.registerContainer.visibility = if (isLogin) View.GONE else View.VISIBLE
        updateStatusText(if (isLogin) {
            getString(R.string.login_status_ready)
        } else {
            ""
        })
    }

    private fun attemptStartupAsync() {
        // Pastikan UI login muncul cepat; proses restore session dilakukan async.
        showNativeLogin(statusMessage = getString(R.string.login_status_ready))

        lifecycleScope.launch {
            if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_PUBLISHABLE_KEY.isBlank()) {
                showNativeLogin(
                    statusMessage = getString(R.string.login_status_config_error),
                    errorMessage = getString(R.string.login_error_config_missing)
                )
                return@launch
            }

            getSupabaseConfigMismatchMessage()?.let { mismatchMessage ->
                showNativeLogin(
                    statusMessage = getString(R.string.login_status_config_error),
                    errorMessage = mismatchMessage
                )
                return@launch
            }

            val (storedSession, rememberEnabled) = withContext(Dispatchers.IO) {
                sessionStore.getStoredSession() to sessionStore.isRememberEnabled()
            }
            rememberEnabledCache = rememberEnabled

            if (storedSession != null && rememberEnabled) {
                stageBootstrapSession(
                    session = storedSession.copy(rememberSession = true),
                    loadingMessage = getString(R.string.login_loading_restore)
                )
                return@launch
            }

            withContext(Dispatchers.IO) {
                sessionStore.clearSession()
                sessionStore.clearLastEmail()
            }
            // Jangan heavy-clear WebView di cold start (rawan ANR saat proses init).
            // Cukup pastikan cookie bootstrap tidak nyangkut; cleanup penuh dilakukan saat bootstrap/logout.
            binding.rootContainer.postDelayed({ clearBootstrapCookieOnly() }, 500)
        }
    }

    private fun clearBootstrapCookieOnly() {
        expireBootstrapCookie {
            Log.d(TAG, "Bootstrap cookie cleared.")
        }
    }

    private fun submitNativeLogin() {
        if (isSubmittingLogin || isLoadingSavedCredential) return

        val email = binding.emailEdit.text?.toString()?.trim().orEmpty()
        val password = binding.passwordEdit.text?.toString().orEmpty()
        val rememberSession = binding.rememberSessionCheck.isChecked
        rememberEnabledCache = rememberSession

        binding.emailLayout.error = null
        binding.passwordLayout.error = null

        when {
            email.isBlank() -> {
                binding.emailLayout.error = getString(R.string.login_error_email_required)
                binding.emailEdit.requestFocus()
                return
            }
            !Patterns.EMAIL_ADDRESS.matcher(email).matches() -> {
                binding.emailLayout.error = getString(R.string.login_error_email_invalid)
                binding.emailEdit.requestFocus()
                return
            }
            password.isBlank() -> {
                binding.passwordLayout.error = getString(R.string.login_error_password_required)
                binding.passwordEdit.requestFocus()
                return
            }
            password.length < 6 -> {
                binding.passwordLayout.error = getString(R.string.login_error_password_short)
                binding.passwordEdit.requestFocus()
                return
            }
        }

        setLoginSubmitting(true)

        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    sessionStore.setRememberEnabled(rememberSession)
                    NativeSessionPolicy.persistedEmailForRememberSetting(email, rememberSession)?.let {
                        sessionStore.setLastEmail(it)
                    } ?: sessionStore.clearLastEmail()
                }

                val loginResult = withContext(Dispatchers.IO) {
                    authService.signInWithPassword(
                        email = email,
                        password = password,
                        rememberSession = rememberSession,
                        deviceId = buildAndroidDeviceId(),
                        appVersion = BuildConfig.VERSION_NAME,
                        appCode = BuildConfig.APP_CODE
                    )
                }

                if (rememberSession) {
                    withContext(Dispatchers.IO) { sessionStore.saveSession(loginResult.session) }
                } else {
                    withContext(Dispatchers.IO) { sessionStore.clearSession() }
                }

                stageBootstrapSession(
                    session = loginResult.session,
                    loadingMessage = getString(R.string.login_loading_handoff),
                    bootstrapCookie = loginResult.bootstrapCookie
                )
                if (rememberSession) {
                    maybeSavePasswordCredential(email, password)
                }
            } catch (error: SupabaseAuthException) {
                showNativeLogin(
                    statusMessage = getString(R.string.login_status_ready),
                    errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                )
            } catch (error: Exception) {
                val errorRef = "APK-LOGIN-UNHANDLED-${System.currentTimeMillis()}"
                Log.e(TAG, "Unexpected native login error [$errorRef]", error)
                showNativeLogin(
                    statusMessage = getString(R.string.login_status_ready),
                    errorMessage = "${getString(R.string.login_error_unexpected)} Ref: $errorRef"
                )
            } finally {
                setLoginSubmitting(false)
            }
        }
    }

    private fun requestSavedCredential() {
        if (isSubmittingLogin || isLoadingSavedCredential) return

        isLoadingSavedCredential = true
        binding.useSavedCredentialButton.isEnabled = false
        binding.useSavedCredentialButton.text = getString(R.string.login_use_saved_credential_loading)

        lifecycleScope.launch {
            try {
                val credential = nativeCredentialManager.getSavedPasswordCredential(this@MainActivity)
                if (credential == null) {
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.login_use_saved_credential_empty),
                        Toast.LENGTH_LONG
                    ).show()
                    return@launch
                }

                replaceInputText(binding.emailEdit, credential.email)
                replaceInputText(binding.passwordEdit, credential.password, moveCursorToEnd = true)
                binding.emailLayout.error = null
                binding.passwordLayout.error = null
                Toast.makeText(
                    this@MainActivity,
                    getString(R.string.login_use_saved_credential_success),
                    Toast.LENGTH_SHORT
                ).show()
            } catch (error: NativeCredentialException) {
                Log.w(TAG, "Loading saved credential failed.", error)
                Toast.makeText(
                    this@MainActivity,
                    "${getString(R.string.login_use_saved_credential_error)} Ref: APK-CRED-LOAD",
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                isLoadingSavedCredential = false
                binding.useSavedCredentialButton.isEnabled = true
                binding.useSavedCredentialButton.text = getString(R.string.login_use_saved_credential)
            }
        }
    }

    private fun maybeSavePasswordCredential(email: String, password: String) {
        lifecycleScope.launch {
            val saved = nativeCredentialManager.savePasswordCredential(
                activity = this@MainActivity,
                email = email,
                password = password
            )
            if (!saved) {
                Log.d(TAG, "Credential manager save skipped or cancelled.")
            }
        }
    }

    private fun handleDebugLoginShortcut() {
        if (!BuildConfig.DEBUG) return

        val email = BuildConfig.DEBUG_LOGIN_EMAIL.trim()
        val password = BuildConfig.DEBUG_LOGIN_PASSWORD

        if (email.isBlank() || password.isBlank()) {
            Toast.makeText(
                this,
                "Debug login credential belum diatur. Ref: APK-DEBUG-CRED-MISSING",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        if (binding.emailEdit.text?.toString() == email &&
            binding.passwordEdit.text?.toString() == password
        ) {
            submitNativeLogin()
            return
        }

        binding.emailLayout.error = null
        binding.passwordLayout.error = null
        replaceInputText(binding.emailEdit, email)
        replaceInputText(binding.passwordEdit, password, moveCursorToEnd = true)

        Toast.makeText(
            this,
            "Debug credential terisi. Tap tombol debug lagi untuk submit.",
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun stageBootstrapSession(
        session: NativeAuthSession,
        loadingMessage: String,
        bootstrapCookie: String? = null
    ) {
        activeAuthSession = session
        bootstrapSessionState.stage(session)
        showLoadingOverlay(loadingMessage)
        binding.loginPanel.visibility = View.GONE

        // Fetch tenant info in background
        fetchAndUpdateTenantInfo(session)

        clearWebSessionData(mode = WebSessionClearMode.BOOTSTRAP) {
            val currentWebView = ensureWebViewCreated()

            applyBootstrapCookie(
                session = session,
                bootstrapCookie = bootstrapCookie
            ) {
                binding.webRefreshLayout.visibility = View.VISIBLE
                updateSwipeRefreshAvailability()
                hideWebConnectionStatus()

                if (!hasInternetConnection()) {
                    currentWebView.stopLoading()
                    currentWebView.loadUrl("about:blank")
                    showWebConnectionStatus(error = null)
                    return@applyBootstrapCookie
                }

                // Load dashboard dengan query param untuk trigger bootstrap
                val bootstrapUrlWithFlag = "$bootstrapUrl?ts=${System.currentTimeMillis()}"
                Log.d(TAG, "Loading bootstrap URL: $bootstrapUrlWithFlag")
                currentWebView.loadUrl(bootstrapUrlWithFlag)

                // Schedule bootstrap session consumption after page load
                currentWebView.postDelayed({
                    if (bootstrapSessionState.hasPendingSession()) {
                        Log.d(TAG, "Injecting bootstrap session to WebView...")
                        currentWebView.evaluateJavascript(
                            """(function() {
                                try {
                                    if (window.Android && typeof window.Android.consumeBootstrapSession === 'function') {
                                        var sessionData = window.Android.consumeBootstrapSession();
                                        console.log('Bootstrap session consumed:', sessionData);
                                        if (sessionData) {
                                            // Notify web side that session is available
                                            window.dispatchEvent(new CustomEvent('native-session-available', {
                                                detail: JSON.parse(sessionData)
                                            }));
                                            console.log('Session event dispatched');
                                        }
                                    } else {
                                        console.log('Android bridge not available');
                                    }
                                } catch (e) {
                                    console.error('Bootstrap session error:', e);
                                }
                            })()""",
                            null
                        )
                    }
                }, 1000)
            }
        }
    }

    private fun loadCachedTenantInfo() {
        lifecycleScope.launch {
            val cachedTenant = withContext(Dispatchers.IO) { sessionStore.getCachedTenantInfo() }
            if (cachedTenant != null) {
                updateBranding(cachedTenant)
            }
        }
    }

    private fun fetchAndUpdateTenantInfo(session: NativeAuthSession) {
        lifecycleScope.launch {
            try {
                val tenant = withContext(Dispatchers.IO) {
                    session.userId?.let { authService.fetchTenantInfoByEmployeeId(it, session.accessToken) }
                }
                if (tenant != null) {
                    withContext(Dispatchers.IO) { sessionStore.saveTenantInfo(tenant) }
                    withContext(Dispatchers.Main) { updateBranding(tenant) }
                }
            } catch (error: Exception) {
                Log.w(TAG, "Failed to fetch tenant info", error)
                // Use cached data or fallback to build config
            }
        }
    }

    private fun updateBranding(tenant: TenantInfo) {
        binding.tenantNameText.text = tenant.name

        // Load logo if URL available
        if (!tenant.logoUrl.isNullOrBlank()) {
            binding.tenantLogoCard.visibility = View.VISIBLE
            Glide.with(this)
                .load(tenant.logoUrl)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .into(binding.tenantLogoImage)
        } else {
            binding.tenantLogoCard.visibility = View.GONE
            Glide.with(this).clear(binding.tenantLogoImage)
        }
    }

    private fun showNativeLogin(statusMessage: String, errorMessage: String? = null) {
        bootstrapSessionState.clear()
        activeAuthSession = null
        binding.loadingPanel.visibility = View.GONE
        binding.webRefreshLayout.isRefreshing = false
        binding.webRefreshLayout.visibility = View.GONE
        updateSwipeRefreshAvailability()
        binding.loginPanel.visibility = View.VISIBLE
        binding.authTabs.getTabAt(0)?.select()
        updateStatusText(statusMessage)
        binding.blockPanel.visibility = View.GONE
        hideWebConnectionStatus()
        replaceInputText(binding.passwordEdit, "")

        if (errorMessage.isNullOrBlank()) {
            binding.loginErrorText.visibility = View.GONE
            binding.loginErrorText.text = ""
        } else {
            binding.loginErrorText.visibility = View.VISIBLE
            binding.loginErrorText.text = errorMessage
        }
    }

    private fun updateStatusText(message: String?) {
        binding.statusText.text = message.orEmpty()
        binding.statusText.visibility = if (message.isNullOrBlank()) View.GONE else View.VISIBLE
    }

    private fun replaceInputText(
        input: TextInputEditText,
        value: String,
        moveCursorToEnd: Boolean = false
    ) {
        val currentText = input.text?.toString().orEmpty()
        if (currentText != value) {
            val editable = input.text
            if (editable != null) {
                editable.replace(0, editable.length, value)
            } else {
                input.setText(value)
            }
        }

        if (moveCursorToEnd) {
            input.setSelection(input.text?.length ?: 0)
        }
    }

    private fun showLoadingOverlay(message: String) {
        binding.loadingText.text = message
        binding.loadingPanel.visibility = View.VISIBLE
        binding.loginErrorText.visibility = View.GONE
    }

    private fun showBootstrapSuccess() {
        bootstrapSessionState.clear()
        binding.loadingPanel.visibility = View.GONE
        binding.loginPanel.visibility = View.GONE
        binding.webRefreshLayout.visibility = View.VISIBLE
        updateSwipeRefreshAvailability()
        replaceInputText(binding.passwordEdit, "")
        hideWebConnectionStatus()
        ensurePushReadyForActiveSession()
        maybeLoadPendingNotificationTarget()
    }

    private fun showBootstrapFailure(message: String, clearStoredSession: Boolean = false) {
        bootstrapSessionState.clear()
        lifecycleScope.launch {
            if (NativeSessionPolicy.shouldClearStoredSessionOnBootstrapFailure(clearStoredSession)) {
                rememberEnabledCache = false
                withContext(Dispatchers.IO) {
                    sessionStore.clearSession()
                    sessionStore.clearLastEmail()
                }
            }
            clearWebSessionData(mode = WebSessionClearMode.FULL) {
                showNativeLogin(
                    statusMessage = getString(R.string.login_status_ready),
                    errorMessage = message
                )
            }
        }
    }

    private fun showBlocked(reason: String) {
        binding.blockReason.text = reason
        binding.blockPanel.visibility = View.VISIBLE
        binding.loadingPanel.visibility = View.GONE
        binding.webRefreshLayout.isRefreshing = false
        webView?.stopLoading()
    }

    private fun showWebConnectionStatus(error: WebResourceError?) {
        webConnectionIssueVisible = true
        binding.loadingPanel.visibility = View.GONE
        binding.webRefreshLayout.isRefreshing = false
        binding.loginPanel.visibility = View.GONE
        binding.webRefreshLayout.visibility = View.VISIBLE
        updateSwipeRefreshAvailability()
        binding.webConnectionStatusTitle.text = getString(R.string.web_connection_status_title)
        val errorLabel = error?.description?.toString()?.takeIf { it.isNotBlank() } ?: "network_unavailable"
        binding.webConnectionStatusMessage.text = getString(
            R.string.web_connection_status_message
        ) + "\n" + getString(R.string.web_connection_status_ref, errorLabel)
        binding.webConnectionStatusCard.visibility = View.VISIBLE
    }

    private fun hideWebConnectionStatus() {
        webConnectionIssueVisible = false
        binding.webConnectionStatusCard.visibility = View.GONE
        updateSwipeRefreshAvailability()
    }

    private fun updateSwipeRefreshAvailability() {
        binding.webRefreshLayout.isEnabled =
            binding.webRefreshLayout.visibility == View.VISIBLE && webConnectionIssueVisible
    }

    private fun shouldHandleAsConnectionIssue(error: WebResourceError?): Boolean {
        if (error == null) return false
        return when (error.errorCode) {
            WebViewClient.ERROR_HOST_LOOKUP,
            WebViewClient.ERROR_CONNECT,
            WebViewClient.ERROR_TIMEOUT,
            WebViewClient.ERROR_IO,
            WebViewClient.ERROR_PROXY_AUTHENTICATION,
            WebViewClient.ERROR_REDIRECT_LOOP,
            WebViewClient.ERROR_UNSUPPORTED_SCHEME -> true
            else -> false
        }
    }

    private fun retryWebViewAfterConnectionIssue() {
        hideWebConnectionStatus()
        reloadCurrentWebView()
    }

    private fun registerNetworkCallbackIfNeeded() {
        if (networkCallbackRegistered) return
        runCatching {
            connectivityManager.registerDefaultNetworkCallback(networkCallback)
            networkCallbackRegistered = true
        }.onFailure {
            Log.w(TAG, "Failed to register network callback.", it)
        }
    }

    private fun unregisterNetworkCallbackIfNeeded() {
        if (!networkCallbackRegistered) return
        runCatching {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        }.onFailure {
            Log.w(TAG, "Failed to unregister network callback.", it)
        }
        networkCallbackRegistered = false
    }

    private fun hasInternetConnection(): Boolean {
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun handleNetworkAvailabilityChanged(isAvailable: Boolean) {
        if (binding.webRefreshLayout.visibility != View.VISIBLE) return
        if (isAvailable) {
            if (webConnectionIssueVisible) {
                hideWebConnectionStatus()
            }
            return
        }
        showWebConnectionStatus(error = null)
    }

    private fun reloadCurrentWebView() {
        if (!hasInternetConnection()) {
            binding.webRefreshLayout.isRefreshing = false
            showWebConnectionStatus(error = null)
            return
        }

        binding.webRefreshLayout.isRefreshing = true
        val currentWebView = webView ?: ensureWebViewCreated()
        val currentUrl = currentWebView.url
        if (!currentUrl.isNullOrBlank() && currentUrl != "about:blank") {
            currentWebView.reload()
        } else if (bootstrapSessionState.hasPendingSession() || bootstrapSessionState.wasConsumed()) {
            currentWebView.loadUrl(bootstrapUrl)
        } else {
            currentWebView.loadUrl(employeeDashboardUrl)
        }
    }

    private fun setLoginSubmitting(isSubmitting: Boolean) {
        isSubmittingLogin = isSubmitting
        binding.loginButton.isEnabled = !isSubmitting
        binding.useSavedCredentialButton.isEnabled = !isSubmitting && !isLoadingSavedCredential
        binding.forgotPasswordButton.isEnabled = !isSubmitting
        binding.registerEmailButton.isEnabled = !isSubmitting
        binding.registerInviteButton.isEnabled = !isSubmitting
        binding.registerOrganizationButton.isEnabled = !isSubmitting
        binding.registerHelpButton.isEnabled = !isSubmitting
        binding.switchToLoginButton.isEnabled = !isSubmitting
        binding.authTabs.isEnabled = !isSubmitting
        binding.loginButton.text = if (isSubmitting) {
            getString(R.string.login_button_loading)
        } else {
            getString(R.string.login_button)
        }
        binding.loginProgress.visibility = if (isSubmitting) View.VISIBLE else View.GONE
    }

    private fun openForgotPasswordDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.login_forgot_password_title)
            .setMessage(R.string.login_forgot_password_message)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton("Lupa Password") { _, _ ->
                openRecoveryMethodDialog(RecoveryAction.FORGOT)
            }
            .setNeutralButton("Ganti Password") { _, _ ->
                openRecoveryMethodDialog(RecoveryAction.CHANGE)
            }
            .show()
    }

    private fun openRegisterHelpDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.register_help_title)
            .setMessage(R.string.register_help_message)
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun openRecoveryMethodDialog(action: RecoveryAction) {
        val methods = arrayOf("Via Email", "Via WhatsApp")
        MaterialAlertDialogBuilder(this)
            .setTitle(if (action == RecoveryAction.FORGOT) "Pilih metode pengiriman" else "Pilih metode OTP")
            .setItems(methods) { _, which ->
                val method = if (which == 0) DeliveryMethod.EMAIL else DeliveryMethod.WHATSAPP
                openRecoveryIdentityDialog(action, method)
            }
            .show()
    }

    private fun openRecoveryIdentityDialog(action: RecoveryAction, method: DeliveryMethod) {
        val container = createDialogContainer()
        val (emailLayout, emailInput) = createInputField(
            hint = getString(R.string.login_email_label),
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            initialText = binding.emailEdit.text?.toString().orEmpty()
        )
        val (whatsappLayout, whatsappInput) = createInputField(
            hint = "No. WhatsApp",
            inputType = InputType.TYPE_CLASS_PHONE,
            initialText = "+62"
        )
        container.addView(emailLayout)
        container.addView(whatsappLayout)

        val positiveLabel = if (action == RecoveryAction.FORGOT) {
            "Kirim Password Baru"
        } else {
            "Kirim OTP"
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(if (action == RecoveryAction.FORGOT) "Lupa Password" else "Ganti Password")
            .setMessage("Masukkan email dan No. WhatsApp terdaftar. Proses ini berjalan native melalui ${method.label}.")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(positiveLabel, null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val email = emailInput.text?.toString()?.trim().orEmpty()
                    val whatsapp = whatsappInput.text?.toString()?.trim().orEmpty()

                    emailLayout.error = null
                    whatsappLayout.error = null

                    if (!validateEmailField(emailLayout, emailInput, email)) return@setOnClickListener
                    if (!validateWhatsappField(whatsappLayout, whatsappInput, whatsapp)) return@setOnClickListener

                    showLoadingOverlay(getString(R.string.login_loading_recovery))
                    lifecycleScope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                authService.validateResetIdentity(email, whatsapp, "employee")
                            }
                            if (action == RecoveryAction.FORGOT) {
                                val resultMessage = withContext(Dispatchers.IO) {
                                    authService.sendNewPassword(email, whatsapp, method.apiValue, "employee")
                                }
                                dialog.dismiss()
                                showNativeLogin(statusMessage = resultMessage)
                                Toast.makeText(
                                    this@MainActivity,
                                    getString(R.string.login_forgot_password_success),
                                    Toast.LENGTH_LONG
                                ).show()
                            } else {
                                val dispatch = withContext(Dispatchers.IO) {
                                    authService.sendPasswordOtp(email, whatsapp, method.apiValue, "employee")
                                }
                                dialog.dismiss()
                                showNativeLogin(
                                    statusMessage = dispatch.destination?.let {
                                        "OTP terkirim ke $it."
                                    } ?: dispatch.message
                                )
                                openRecoveryOtpDialog(email, whatsapp, method, dispatch.destination)
                            }
                        } catch (error: SupabaseAuthException) {
                            showNativeLogin(
                                statusMessage = getString(R.string.login_status_ready),
                                errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                            )
                        } catch (error: Exception) {
                            val errorRef = "APK-RECOVERY-UNHANDLED-${System.currentTimeMillis()}"
                            Log.e(TAG, "Unexpected password recovery error [$errorRef]", error)
                            showNativeLogin(
                                statusMessage = getString(R.string.login_status_ready),
                                errorMessage = "${getString(R.string.login_error_recovery_unexpected)} Ref: $errorRef"
                            )
                        }
                    }
                }
            }
    }

    private fun openRecoveryOtpDialog(
        email: String,
        whatsapp: String,
        method: DeliveryMethod,
        destination: String?
    ) {
        val container = createDialogContainer()
        destination?.takeIf { it.isNotBlank() }?.let {
            container.addView(createInfoText("OTP dikirim ke $it"))
        }
        val (otpLayout, otpInput) = createInputField(
            hint = "Kode OTP",
            inputType = InputType.TYPE_CLASS_NUMBER
        )
        val (newPasswordLayout, newPasswordInput) = createInputField(
            hint = "Password baru",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        val (confirmLayout, confirmInput) = createInputField(
            hint = "Konfirmasi password baru",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        container.addView(otpLayout)
        container.addView(newPasswordLayout)
        container.addView(confirmLayout)

        MaterialAlertDialogBuilder(this)
            .setTitle("Verifikasi OTP")
            .setMessage("Masukkan OTP dan password baru Anda.")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setNeutralButton("Kirim Ulang OTP", null)
            .setPositiveButton("Ubah Password", null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                    showLoadingOverlay(getString(R.string.login_loading_recovery))
                    lifecycleScope.launch {
                        try {
                            val dispatch = withContext(Dispatchers.IO) {
                                authService.sendPasswordOtp(email, whatsapp, method.apiValue, "employee")
                            }
                            showNativeLogin(
                                statusMessage = dispatch.destination?.let { "OTP terkirim ulang ke $it." }
                                    ?: dispatch.message
                            )
                        } catch (error: SupabaseAuthException) {
                            showNativeLogin(
                                statusMessage = getString(R.string.login_status_ready),
                                errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                            )
                        }
                    }
                }

                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val otp = otpInput.text?.toString()?.trim().orEmpty()
                    val newPassword = newPasswordInput.text?.toString().orEmpty()
                    val confirmPassword = confirmInput.text?.toString().orEmpty()

                    otpLayout.error = null
                    newPasswordLayout.error = null
                    confirmLayout.error = null

                    when {
                        otp.length != 6 -> {
                            otpLayout.error = getString(R.string.login_error_otp_required)
                            otpInput.requestFocus()
                        }
                        newPassword.length < 6 -> {
                            newPasswordLayout.error = getString(R.string.login_error_password_short)
                            newPasswordInput.requestFocus()
                        }
                        newPassword != confirmPassword -> {
                            confirmLayout.error = getString(R.string.login_error_password_confirm)
                            confirmInput.requestFocus()
                        }
                        else -> {
                            showLoadingOverlay(getString(R.string.login_loading_recovery))
                            lifecycleScope.launch {
                                try {
                                    withContext(Dispatchers.IO) {
                                        authService.verifyPasswordOtp(email, otp, newPassword)
                                    }
                                    dialog.dismiss()
                                    showNativeLogin(statusMessage = "Password berhasil diubah. Silakan login kembali.")
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Password berhasil diubah.",
                                        Toast.LENGTH_LONG
                                    ).show()
                                } catch (error: SupabaseAuthException) {
                                    showNativeLogin(
                                        statusMessage = getString(R.string.login_status_ready),
                                        errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                                    )
                                }
                            }
                        }
                    }
                }
            }
    }

    private fun openSelfRegistrationStartDialog() {
        val container = createDialogContainer()
        container.addView(createInfoText("Daftar mandiri via email. Setelah akun aktif, Anda dapat memasukkan kode undangan organisasi di dashboard."))
        val (emailLayout, emailInput) = createInputField(
            hint = "Email aktif",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        )
        container.addView(emailLayout)

        MaterialAlertDialogBuilder(this)
            .setTitle("Daftar via Email")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton("Kirim OTP", null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val email = emailInput.text?.toString()?.trim().orEmpty()
                    emailLayout.error = null
                    if (!validateEmailField(emailLayout, emailInput, email)) return@setOnClickListener

                    showLoadingOverlay(getString(R.string.login_loading_register))
                    lifecycleScope.launch {
                        try {
                            val dispatch = withContext(Dispatchers.IO) {
                                authService.sendRegistrationOtp(email)
                            }
                            dialog.dismiss()
                            showNativeLogin(
                                statusMessage = dispatch.destination?.let { "OTP registrasi dikirim ke $it." }
                                    ?: dispatch.message
                            )
                            openSelfRegistrationProfileDialog(email, dispatch.destination)
                        } catch (error: SupabaseAuthException) {
                            showNativeLogin(
                                statusMessage = getString(R.string.login_status_ready),
                                errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                            )
                        }
                    }
                }
            }
    }

    private fun openSelfRegistrationProfileDialog(email: String, destination: String?) {
        val container = createDialogContainer()
        destination?.takeIf { it.isNotBlank() }?.let {
            container.addView(createInfoText("Masukkan OTP yang dikirim ke $it lalu lengkapi profil Anda."))
        }
        val (otpLayout, otpInput) = createInputField(
            hint = "Kode OTP",
            inputType = InputType.TYPE_CLASS_NUMBER
        )
        val (nameLayout, nameInput) = createInputField(
            hint = "Nama lengkap",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        )
        val (whatsappLayout, whatsappInput) = createInputField(
            hint = "No. WhatsApp",
            inputType = InputType.TYPE_CLASS_PHONE,
            initialText = "+62"
        )
        // REMOVED: Address field (not in web /employee/login)
        val (passwordLayout, passwordInput) = createInputField(
            hint = "Password",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        val (confirmLayout, confirmInput) = createInputField(
            hint = "Konfirmasi password",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        container.addView(otpLayout)
        container.addView(nameLayout)
        container.addView(whatsappLayout)
        // container.addView(addressLayout) // REMOVED
        container.addView(passwordLayout)
        container.addView(confirmLayout)

        MaterialAlertDialogBuilder(this)
            .setTitle("Lengkapi Profil")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setNeutralButton("Kirim Ulang OTP", null)
            .setPositiveButton("Daftar Sekarang", null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                    showLoadingOverlay(getString(R.string.login_loading_register))
                    lifecycleScope.launch {
                        try {
                            val dispatch = withContext(Dispatchers.IO) {
                                authService.sendRegistrationOtp(email)
                            }
                            showNativeLogin(
                                statusMessage = dispatch.destination?.let { "OTP terkirim ulang ke $it." }
                                    ?: dispatch.message
                            )
                        } catch (error: SupabaseAuthException) {
                            showNativeLogin(
                                statusMessage = getString(R.string.login_status_ready),
                                errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                            )
                        }
                    }
                }

                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val otp = otpInput.text?.toString()?.trim().orEmpty()
                    val name = nameInput.text?.toString()?.trim().orEmpty()
                    val whatsapp = whatsappInput.text?.toString()?.trim().orEmpty()
                    // REMOVED: address field
                    val password = passwordInput.text?.toString().orEmpty()
                    val confirmPassword = confirmInput.text?.toString().orEmpty()

                    otpLayout.error = null
                    nameLayout.error = null
                    whatsappLayout.error = null
                    passwordLayout.error = null
                    confirmLayout.error = null

                    when {
                        otp.length != 6 -> {
                            otpLayout.error = getString(R.string.login_error_otp_required)
                            otpInput.requestFocus()
                        }
                        name.isBlank() -> {
                            nameLayout.error = getString(R.string.login_error_name_required)
                            nameInput.requestFocus()
                        }
                        !validateWhatsappInline(whatsappLayout, whatsappInput, whatsapp) -> Unit
                        password.length < 6 -> {
                            passwordLayout.error = getString(R.string.login_error_password_short)
                            passwordInput.requestFocus()
                        }
                        password != confirmPassword -> {
                            confirmLayout.error = getString(R.string.login_error_password_confirm)
                            confirmInput.requestFocus()
                        }
                        else -> {
                            showLoadingOverlay(getString(R.string.login_loading_register))
                            lifecycleScope.launch {
                                try {
                                    withContext(Dispatchers.IO) {
                                        authService.verifyRegistrationOtp(
                                            email = email,
                                            otp = otp,
                                            name = name,
                                            whatsapp = whatsapp,
                                            address = "", // REMOVED: send empty string
                                            password = password
                                        )
                                    }
                                    dialog.dismiss()
                                    lifecycleScope.launch(Dispatchers.IO) {
                                        sessionStore.clearLastEmail()
                                    }
                                    showNativeLogin(statusMessage = getString(R.string.login_status_register_success))
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Registrasi berhasil. Silakan login.",
                                        Toast.LENGTH_LONG
                                    ).show()
                                } catch (error: SupabaseAuthException) {
                                    showNativeLogin(
                                        statusMessage = getString(R.string.login_status_ready),
                                        errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                                    )
                                }
                            }
                        }
                    }
                }
            }
    }

    private fun openInviteLookupDialog() {
        val container = createDialogContainer()
        container.addView(createInfoText("Masukkan kode undangan dari admin organisasi Anda untuk mendaftar langsung ke tenant yang benar."))
        val (codeLayout, codeInput) = createInputField(
            hint = "Kode undangan",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        )
        container.addView(codeLayout)

        MaterialAlertDialogBuilder(this)
            .setTitle("Daftar via Undangan")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton("Verifikasi Kode", null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val code = codeInput.text?.toString()?.trim().orEmpty()
                    codeLayout.error = null
                    if (code.isBlank()) {
                        codeLayout.error = getString(R.string.login_error_invitation_required)
                        codeInput.requestFocus()
                        return@setOnClickListener
                    }

                    showLoadingOverlay(getString(R.string.login_loading_verify_invitation))
                    lifecycleScope.launch {
                        try {
                            val invitation = withContext(Dispatchers.IO) {
                                authService.fetchInvitation(code)
                            }
                            dialog.dismiss()
                            showNativeLogin(
                                statusMessage = invitation.tenantName?.let {
                                    "Undangan valid untuk $it."
                                } ?: "Undangan valid."
                            )
                            openInviteRegistrationDialog(invitation)
                        } catch (error: SupabaseAuthException) {
                            showNativeLogin(
                                statusMessage = getString(R.string.login_status_ready),
                                errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                            )
                        }
                    }
                }
            }
    }

    private fun openInviteRegistrationDialog(invitation: NativeInvitationData) {
        val container = createDialogContainer()
        container.addView(
            createInfoText(
                buildString {
                    append("Organisasi: ")
                    append(invitation.tenantName ?: "-")
                    if (!invitation.nik.isBlank()) {
                        append("\nNIK: ")
                        append(invitation.nik)
                    }
                }
            )
        )
        val (nameLayout, nameInput) = createInputField(
            hint = "Nama lengkap",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS,
            initialText = invitation.name.orEmpty()
        )
        val (emailLayout, emailInput) = createInputField(
            hint = getString(R.string.login_email_label),
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            initialText = invitation.email.orEmpty()
        )
        val (whatsappLayout, whatsappInput) = createInputField(
            hint = "No. WhatsApp",
            inputType = InputType.TYPE_CLASS_PHONE,
            initialText = invitation.phone ?: "+62"
        )
        // ADDED: NIK field (to match web /employee/login)
        val (nikLayout, nikInput) = createInputField(
            hint = "NIK",
            inputType = InputType.TYPE_CLASS_NUMBER,
            initialText = invitation.nik.orEmpty()
        )
        nikInput.isEnabled = invitation.nik.isNotBlank() // read-only if already filled
        // REMOVED: Address field (not in web /employee/login)
        val (passwordLayout, passwordInput) = createInputField(
            hint = "Password",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        val (confirmLayout, confirmInput) = createInputField(
            hint = "Konfirmasi password",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        container.addView(nameLayout)
        container.addView(emailLayout)
        container.addView(whatsappLayout)
        container.addView(nikLayout) // ADDED
        // container.addView(addressLayout) // REMOVED
        container.addView(passwordLayout)
        container.addView(confirmLayout)

        MaterialAlertDialogBuilder(this)
            .setTitle("Lengkapi Registrasi Undangan")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton("Daftar Sekarang", null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val name = nameInput.text?.toString()?.trim().orEmpty()
                    val email = emailInput.text?.toString()?.trim().orEmpty()
                    val whatsapp = whatsappInput.text?.toString()?.trim().orEmpty()
                    nikInput.text?.toString()?.trim().orEmpty()
                    // REMOVED: address field
                    val password = passwordInput.text?.toString().orEmpty()
                    val confirmPassword = confirmInput.text?.toString().orEmpty()

                    nameLayout.error = null
                    emailLayout.error = null
                    whatsappLayout.error = null
                    nikLayout.error = null // ADDED
                    passwordLayout.error = null
                    confirmLayout.error = null

                    when {
                        name.isBlank() -> {
                            nameLayout.error = getString(R.string.login_error_name_required)
                            nameInput.requestFocus()
                        }
                        !validateEmailInline(emailLayout, emailInput, email) -> Unit
                        !validateWhatsappInline(whatsappLayout, whatsappInput, whatsapp) -> Unit
                        password.length < 6 -> {
                            passwordLayout.error = getString(R.string.login_error_password_short)
                            passwordInput.requestFocus()
                        }
                        password != confirmPassword -> {
                            confirmLayout.error = getString(R.string.login_error_password_confirm)
                            confirmInput.requestFocus()
                        }
                        else -> {
                            showLoadingOverlay(getString(R.string.login_loading_register))
                            lifecycleScope.launch {
                                try {
                                    withContext(Dispatchers.IO) {
                                        authService.registerWithInvitation(
                                            invitation = invitation,
                                            name = name,
                                            email = email,
                                            password = password
                                        )
                                    }
                                    dialog.dismiss()
                                    lifecycleScope.launch(Dispatchers.IO) {
                                        sessionStore.clearLastEmail()
                                    }
                                    showNativeLogin(statusMessage = getString(R.string.login_status_register_success))
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Registrasi undangan berhasil. Silakan login.",
                                        Toast.LENGTH_LONG
                                    ).show()
                                } catch (error: SupabaseAuthException) {
                                    showNativeLogin(
                                        statusMessage = getString(R.string.login_status_ready),
                                        errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                                    )
                                }
                            }
                        }
                    }
                }
            }
    }

    private fun openOrganizationRegistrationInfoDialog() {
        val container = createDialogContainer()
        container.addView(createInfoText("Anda akan dialihkan ke halaman pendaftaran organisasi baru. Pastikan Anda adalah perwakilan resmi dari organisasi yang akan didaftarkan."))

        val featuresContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16.dp, 16.dp, 16.dp, 16.dp)
            setBackgroundColor(0xFFE8F0F8.toInt())
        }

        val featuresTitle = TextView(this).apply {
            text = "Dengan mendaftar, Anda dapat:"
            textSize = 14f
            setTextColor(0xFF1A1A1A.toInt())
            setPadding(0, 0, 0, 8.dp)
        }

        val featuresList = arrayOf(
            "Mengelola absensi seluruh pegawai",
            "Membuat struktur organisasi dan OPD",
            "Mengundang dan mengelola pegawai",
            "Melihat laporan kehadiran lengkap"
        )

        featuresList.forEach { feature ->
            val featureText = TextView(this).apply {
                text = "• $feature"
                textSize = 13f
                setTextColor(0xFF666666.toInt())
                setPadding(0, 4.dp, 0, 4.dp)
            }
            featuresContainer.addView(featureText)
        }

        container.addView(featuresTitle)
        container.addView(featuresContainer)

        MaterialAlertDialogBuilder(this)
            .setTitle("Daftar Organisasi")
            .setIcon(android.R.drawable.ic_dialog_info)
            .setView(container)
            .setNegativeButton("Batal", null)
            .setPositiveButton("Lanjutkan Daftar") { _, _ ->
                openOrganizationRegistrationDialog()
            }
            .show()
    }

    private fun openOrganizationRegistrationDialog() {
        val container = createDialogContainer()
        // REMOVED: Info text (not needed for UX)
        // container.addView(createInfoText("Pendaftaran organisasi dijalankan native..."))

        val (nameLayout, nameInput) = createInputField(
            hint = "Nama lengkap admin",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        )
        val (emailLayout, emailInput) = createInputField(
            hint = "Email admin",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        )
        val (whatsappLayout, whatsappInput) = createInputField(
            hint = "No. WhatsApp",
            inputType = InputType.TYPE_CLASS_PHONE,
            initialText = "+62"
        )
        val (passwordLayout, passwordInput) = createInputField(
            hint = "Password",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        val (confirmLayout, confirmInput) = createInputField(
            hint = "Konfirmasi password",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            isPassword = true
        )
        val (orgNameLayout, orgNameInput) = createInputField(
            hint = "Nama organisasi",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        )
        val (orgTypeLayout, orgTypeInput) = createDropdownField(
            hint = getString(R.string.register_org_type_label),
            options = organizationTypeOptions.map { it.label }
        )
        val (officeNameLayout, officeNameInput) = createInputFieldLarge(
            hint = "Nama kantor",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        )
        val (officeAddressLayout, officeAddressInput) = createInputFieldLarge(
            hint = "Alamat kantor",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES,
            multiline = true
        )
        val coordinateRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val (latitudeLayout, latitudeInput) = createInputField(
            hint = "Latitude",
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
        )
        val (longitudeLayout, longitudeInput) = createInputField(
            hint = "Longitude",
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
        )
        coordinateRow.addView(latitudeLayout, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginEnd = 6.dp
        })
        coordinateRow.addView(longitudeLayout, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = 6.dp
        })

        container.addView(nameLayout)
        container.addView(emailLayout)
        container.addView(whatsappLayout)
        container.addView(passwordLayout)
        container.addView(confirmLayout)
        container.addView(orgNameLayout)
        container.addView(orgTypeLayout)
        container.addView(officeNameLayout)
        container.addView(officeAddressLayout)
        container.addView(coordinateRow)

        MaterialAlertDialogBuilder(this)
            .setTitle("Daftar Organisasi")
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton("Daftar Organisasi", null)
            .show()
            .also { dialog ->
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val name = nameInput.text?.toString()?.trim().orEmpty()
                    val email = emailInput.text?.toString()?.trim().orEmpty()
                    val whatsapp = whatsappInput.text?.toString()?.trim().orEmpty()
                    val password = passwordInput.text?.toString().orEmpty()
                    val confirmPassword = confirmInput.text?.toString().orEmpty()
                    val organizationName = orgNameInput.text?.toString()?.trim().orEmpty()
                    val organizationTypeLabel = orgTypeInput.text?.toString()?.trim().orEmpty()
                    val officeName = officeNameInput.text?.toString()?.trim().orEmpty()
                    val officeAddress = officeAddressInput.text?.toString()?.trim().orEmpty()
                    val officeLatitude = latitudeInput.text?.toString()?.trim().orEmpty()
                    val officeLongitude = longitudeInput.text?.toString()?.trim().orEmpty()

                    nameLayout.error = null
                    emailLayout.error = null
                    whatsappLayout.error = null
                    passwordLayout.error = null
                    confirmLayout.error = null
                    orgNameLayout.error = null
                    orgTypeLayout.error = null
                    officeNameLayout.error = null
                    officeAddressLayout.error = null
                    latitudeLayout.error = null
                    longitudeLayout.error = null

                    val selectedOrgType = organizationTypeOptions.firstOrNull { it.label == organizationTypeLabel }

                    when {
                        name.isBlank() -> {
                            nameLayout.error = getString(R.string.login_error_name_required)
                            nameInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Nama lengkap admin wajib diisi", Toast.LENGTH_SHORT).show()
                        }
                        !validateEmailInline(emailLayout, emailInput, email) -> {
                            Toast.makeText(this@MainActivity, "Email admin tidak valid", Toast.LENGTH_SHORT).show()
                        }
                        !validateWhatsappInline(whatsappLayout, whatsappInput, whatsapp) -> {
                            Toast.makeText(this@MainActivity, "No. WhatsApp tidak valid", Toast.LENGTH_SHORT).show()
                        }
                        password.length < 6 -> {
                            passwordLayout.error = getString(R.string.login_error_password_short)
                            passwordInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Password minimal 6 karakter", Toast.LENGTH_SHORT).show()
                        }
                        password != confirmPassword -> {
                            confirmLayout.error = getString(R.string.login_error_password_confirm)
                            confirmInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Password dan konfirmasi tidak cocok", Toast.LENGTH_SHORT).show()
                        }
                        organizationName.isBlank() -> {
                            orgNameLayout.error = "Nama organisasi wajib diisi."
                            orgNameInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Nama organisasi wajib diisi", Toast.LENGTH_SHORT).show()
                        }
                        selectedOrgType == null -> {
                            orgTypeLayout.error = "Pilih tipe organisasi."
                            orgTypeInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Pilih tipe organisasi", Toast.LENGTH_SHORT).show()
                        }
                        officeName.isBlank() -> {
                            officeNameLayout.error = "Nama kantor wajib diisi."
                            officeNameInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Nama kantor wajib diisi", Toast.LENGTH_SHORT).show()
                        }
                        officeLatitude.isBlank() || officeLongitude.isBlank() -> {
                            latitudeLayout.error = getString(R.string.login_error_coordinates_required)
                            longitudeLayout.error = getString(R.string.login_error_coordinates_required)
                            latitudeInput.requestFocus()
                            Toast.makeText(this@MainActivity, "Latitude dan longitude kantor wajib diisi", Toast.LENGTH_SHORT).show()
                        }
                        else -> {
                            showLoadingOverlay(getString(R.string.login_loading_register))
                            lifecycleScope.launch {
                                try {
                                    withContext(Dispatchers.IO) {
                                        authService.registerOrganization(
                                            NativeOrganizationRegistrationData(
                                                name = name,
                                                email = email,
                                                whatsapp = whatsapp,
                                                password = password,
                                                organizationName = organizationName,
                                                organizationType = selectedOrgType.value,
                                                officeName = officeName,
                                                officeAddress = officeAddress,
                                                officeLatitude = officeLatitude,
                                                officeLongitude = officeLongitude
                                            )
                                        )
                                    }
                                    dialog.dismiss()
                                    showNativeLogin(statusMessage = "Registrasi organisasi berhasil. Silakan cek email atau login dengan akun admin yang baru dibuat.")
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Registrasi organisasi berhasil.",
                                        Toast.LENGTH_LONG
                                    ).show()
                                } catch (error: SupabaseAuthException) {
                                    showNativeLogin(
                                        statusMessage = getString(R.string.login_status_ready),
                                        errorMessage = "${error.userMessage} Ref: ${error.errorRef}"
                                    )
                                }
                            }
                        }
                    }
                }
            }
    }

    private fun createDialogContainer(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(12.dp, 8.dp, 12.dp, 0.dp)
        }
    }

    private fun createInputField(
        hint: String,
        inputType: Int,
        initialText: String = "",
        isPassword: Boolean = false,
        multiline: Boolean = false
    ): Pair<TextInputLayout, TextInputEditText> {
        val layout = TextInputLayout(this).apply {
            this.hint = hint
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
        }
        val input = TextInputEditText(layout.context).apply {
            this.inputType = inputType
            setText(initialText)
            if (multiline) {
                minLines = 2
                maxLines = 3
            } else {
                maxLines = 1
            }
        }
        if (isPassword) {
            layout.endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
        }
        layout.addView(input)
        val params = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = 10.dp
        }
        layout.layoutParams = params
        return layout to input
    }

    private fun createInputFieldLarge(
        hint: String,
        inputType: Int,
        initialText: String = "",
        isPassword: Boolean = false,
        multiline: Boolean = false
    ): Pair<TextInputLayout, TextInputEditText> {
        val layout = TextInputLayout(this).apply {
            this.hint = hint
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            placeholderText = hint
        }
        val input = TextInputEditText(layout.context).apply {
            this.inputType = inputType
            setText(initialText)
            textSize = 18f // Even larger font size for better visibility
            if (multiline) {
                minLines = 4
                maxLines = 5
            } else {
                minLines = 3  // Increased from 2 to 3 lines
                maxLines = 3
            }
            setPadding(20.dp, 20.dp, 20.dp, 20.dp) // More padding
        }
        if (isPassword) {
            layout.endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
        }
        layout.addView(input)
        val params = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = 14.dp
        }
        layout.layoutParams = params
        return layout to input
    }

    private fun createDropdownField(
        hint: String,
        options: List<String>
    ): Pair<TextInputLayout, MaterialAutoCompleteTextView> {
        val layout = TextInputLayout(this).apply {
            this.hint = hint
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            endIconMode = TextInputLayout.END_ICON_DROPDOWN_MENU
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = 10.dp
            }
        }
        val input = MaterialAutoCompleteTextView(layout.context).apply {
            setAdapter(
                ArrayAdapter(
                    this@MainActivity,
                    android.R.layout.simple_list_item_1,
                    options
                )
            )
            inputType = InputType.TYPE_NULL
            keyListener = null
        }
        layout.addView(input)
        return layout to input
    }

    private fun createInfoText(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 13f
            setTextColor(0xFF5E6D82.toInt())
            setPadding(0, 0, 0, 4.dp)
        }
    }

    private fun validateEmailField(
        emailLayout: TextInputLayout,
        emailInput: TextInputEditText,
        email: String
    ): Boolean {
        return when {
            email.isBlank() -> {
                emailLayout.error = getString(R.string.login_error_email_required)
                emailInput.requestFocus()
                false
            }
            !Patterns.EMAIL_ADDRESS.matcher(email).matches() -> {
                emailLayout.error = getString(R.string.login_error_email_invalid)
                emailInput.requestFocus()
                false
            }
            else -> true
        }
    }

    private fun validateEmailInline(
        emailLayout: TextInputLayout,
        emailInput: TextInputEditText,
        email: String
    ): Boolean = validateEmailField(emailLayout, emailInput, email)

    private fun validateWhatsappField(
        whatsappLayout: TextInputLayout,
        whatsappInput: TextInputEditText,
        whatsapp: String
    ): Boolean {
        return validateWhatsappInline(whatsappLayout, whatsappInput, whatsapp)
    }

    private fun validateWhatsappInline(
        whatsappLayout: TextInputLayout,
        whatsappInput: TextInputEditText,
        whatsapp: String
    ): Boolean {
        val sanitized = whatsapp.replace("\\s|-".toRegex(), "")
        val isValid = Regex("^(\\+?62|0)[0-9]{8,13}$").matches(sanitized)
        return when {
            whatsapp.isBlank() -> {
                whatsappLayout.error = getString(R.string.login_error_whatsapp_required)
                whatsappInput.requestFocus()
                false
            }
            !isValid -> {
                whatsappLayout.error = getString(R.string.login_error_whatsapp_invalid)
                whatsappInput.requestFocus()
                false
            }
            else -> true
        }
    }

    private fun buildAndroidDeviceId(): String {
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return if (androidId.isNullOrBlank()) {
            "AND-${BuildConfig.APPLICATION_ID}-${Build.VERSION.SDK_INT}"
        } else {
            "AND-$androidId"
        }
    }

    private fun handleNotificationIntent(intent: Intent?) {
        val rawTarget = intent?.getStringExtra(FcmRuntime.EXTRA_TARGET_URL)
        val sanitizedTarget = sanitizeNotificationTargetUrl(rawTarget) ?: return
        pendingNotificationTargetUrl = sanitizedTarget
        maybeLoadPendingNotificationTarget()
    }

    private fun sanitizeNotificationTargetUrl(rawTarget: String?): String? {
        val trimmed = rawTarget?.trim().orEmpty()
        if (trimmed.isBlank()) return null

        return try {
            val uri = URI(trimmed)
            if (uri.isAbsolute) {
                if (isAllowedUrl(trimmed)) trimmed else null
            } else {
                val normalizedPath = if (trimmed.startsWith("/")) trimmed else "/$trimmed"
                val candidate = "$webBaseUrl$normalizedPath"
                if (isAllowedUrl(candidate)) candidate else null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun maybeLoadPendingNotificationTarget() {
        val targetUrl = pendingNotificationTargetUrl ?: return
        val currentWebView = webView ?: return
        if (binding.webRefreshLayout.visibility != View.VISIBLE) return
        if (bootstrapSessionState.hasPendingSession()) return

        pendingNotificationTargetUrl = null
        currentWebView.loadUrl(targetUrl)
    }

    private fun ensurePushReadyForActiveSession() {
        activeAuthSession ?: return
        val pushStatus = FcmRuntime.pushSupportStatus(this)
        if (pushStatus != FcmRuntime.PushSupportStatus.READY) {
            val reason = FcmRuntime.userVisibleSupportMessage(this)
            Log.w(TAG, "Push perangkat belum siap: $pushStatus")
            if (!reason.isNullOrBlank()) {
                Toast.makeText(this, reason, Toast.LENGTH_LONG).show()
            }
            return
        }

        FcmRuntime.ensureNotificationChannel(this)
        val permissionState = FcmRuntime.currentPermissionState(this)
        sessionStore.setPushPermissionState(permissionState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permissionGranted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!permissionGranted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                return
            }
        }

        syncPushTokenForActiveSession()
    }

    private fun syncPushTokenForActiveSession(force: Boolean = false) {
        val session = activeAuthSession ?: return
        val pushStatus = FcmRuntime.pushSupportStatus(this)
        if (pushStatus != FcmRuntime.PushSupportStatus.READY) {
            Log.w(TAG, "Sinkron token dilewati karena push belum siap: $pushStatus")
            return
        }

        val permissionState = FcmRuntime.currentPermissionState(this)
        sessionStore.setPushPermissionState(permissionState)

        val cachedToken = sessionStore.getPushToken()
        if (!cachedToken.isNullOrBlank() && (force || sessionStore.shouldSyncPushToken(session.userId, cachedToken, permissionState))) {
            registerPushToken(session, cachedToken, permissionState)
        }

        FcmRuntime.requestToken(
            context = this,
            onSuccess = { token ->
                sessionStore.savePushToken(token)
                if (force || sessionStore.shouldSyncPushToken(session.userId, token, permissionState)) {
                    registerPushToken(session, token, permissionState)
                }
            },
            onFailure = { error ->
                Log.w(TAG, "Gagal mengambil token FCM.", error)
            }
        )
    }

    private fun registerPushToken(
        session: NativeAuthSession,
        token: String,
        permissionState: String,
    ) {
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                authService.syncDevicePushToken(
                    authSession = session,
                    installationId = sessionStore.getOrCreatePushInstallationId(),
                    fcmToken = token,
                    deviceId = buildAndroidDeviceId(),
                    deviceModel = listOf(Build.MANUFACTURER, Build.MODEL)
                        .map { it.trim() }
                        .filter { it.isNotBlank() }
                        .joinToString(" "),
                    appVersion = BuildConfig.VERSION_NAME,
                    notificationPermissionState = permissionState,
                    appCode = BuildConfig.APP_CODE,
                    active = true
                )
                sessionStore.markPushTokenSynced(session.userId, token, permissionState)
            }.onFailure {
                Log.w(TAG, "Gagal sinkron token push ke backend.", it)
            }
        }
    }

    private fun deactivatePushForCurrentSession() {
        val session = activeAuthSession ?: return
        val cachedToken = sessionStore.getPushToken()
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                authService.syncDevicePushToken(
                    authSession = session,
                    installationId = sessionStore.getOrCreatePushInstallationId(),
                    fcmToken = cachedToken,
                    deviceId = buildAndroidDeviceId(),
                    deviceModel = listOf(Build.MANUFACTURER, Build.MODEL)
                        .map { it.trim() }
                        .filter { it.isNotBlank() }
                        .joinToString(" "),
                    appVersion = BuildConfig.VERSION_NAME,
                    notificationPermissionState = FcmRuntime.currentPermissionState(this@MainActivity),
                    appCode = BuildConfig.APP_CODE,
                    active = false
                )
                sessionStore.clearPushSyncFingerprint()
                FcmRuntime.setAutoInitEnabled(this@MainActivity, false)
            }.onFailure {
                Log.w(TAG, "Gagal menonaktifkan token push untuk sesi aktif.", it)
            }
        }
    }

    private fun clearWebSessionData(
        mode: WebSessionClearMode = WebSessionClearMode.BOOTSTRAP,
        onComplete: () -> Unit
    ) {
        val startedAt = SystemClock.elapsedRealtime()
        val completed = AtomicBoolean(false)
        val finishOnce = {
            if (completed.compareAndSet(false, true)) {
                Log.d(
                    TAG,
                    "clearWebSessionData(${mode.name}) finished in ${SystemClock.elapsedRealtime() - startedAt}ms"
                )
                runOnUiThread(onComplete)
            }
        }

        // Hard timeout guard: jangan sampai stuck dan memicu ANR saat reset session WebView.
        // Jika WebView belum di-init, gunakan rootContainer sebagai scheduler (tidak memicu init WebView engine).
        binding.rootContainer.postDelayed(
            {
                if (completed.compareAndSet(false, true)) {
                    Log.w(TAG, "clearWebSessionData timeout. Ref: APK-WEBCLR-TIMEOUT")
                    runOnUiThread(onComplete)
                }
            },
            3000
        )

        webView?.let { currentWebView ->
            currentWebView.stopLoading()
            currentWebView.loadUrl("about:blank")
            currentWebView.clearHistory()
            currentWebView.clearFormData()
        }

        val cookieManager = CookieManager.getInstance()

        if (mode == WebSessionClearMode.BOOTSTRAP) {
            expireBootstrapCookie()
            cookieManager.removeSessionCookies {
                binding.rootContainer.post {
                    runCatching { cookieManager.flush() }
                        .onFailure { Log.w(TAG, "Failed to flush session cookies.", it) }
                    finishOnce()
                }
            }
            return
        }

        Thread {
            runCatching { WebStorage.getInstance().deleteAllData() }
                .onFailure { Log.w(TAG, "Failed to clear WebStorage.", it) }
        }.start()

        cookieManager.removeAllCookies {
            binding.rootContainer.post {
                runCatching { cookieManager.flush() }
                    .onFailure { Log.w(TAG, "Failed to flush all cookies.", it) }
                finishOnce()
            }
        }
    }

    private suspend fun clearWebSessionDataAwait(
        mode: WebSessionClearMode = WebSessionClearMode.BOOTSTRAP
    ) {
        suspendCancellableCoroutine { continuation ->
            clearWebSessionData(mode = mode) {
                if (continuation.isActive) continuation.resume(Unit)
            }
        }
    }

    private fun runDebugStress(iterations: Int = 10) {
        if (!BuildConfig.DEBUG) return
        if (isRunningDebugStress) return
        isRunningDebugStress = true

        val boundedIterations = iterations.coerceIn(1, 100)
        Log.i(TAG, "Debug stress started. iterations=$boundedIterations Ref: APK-STRESS-START")

        setLoginSubmitting(true)
        binding.debugStressButton.isEnabled = false
        showLoadingOverlay("Uji stabilitas dimulai… (1/$boundedIterations)")

        lifecycleScope.launch {
            try {
                for (i in 1..boundedIterations) {
                    Log.d(TAG, "Debug stress step $i/$boundedIterations start. Ref: APK-STRESS-STEP")
                    withContext(Dispatchers.Main) {
                        showLoadingOverlay("Uji stabilitas… ($i/$boundedIterations)")
                        ensureWebViewCreated()
                        binding.webRefreshLayout.visibility = View.VISIBLE
                        updateSwipeRefreshAvailability()
                    }

                    withContext(Dispatchers.Main) { clearWebSessionDataAwait(mode = WebSessionClearMode.FULL) }

                    withContext(Dispatchers.Main) {
                        val currentWebView = webView
                        if (currentWebView != null) {
                            currentWebView.stopLoading()
                            currentWebView.loadUrl("about:blank")
                            currentWebView.clearHistory()
                        }
                        binding.webRefreshLayout.visibility = View.GONE
                        updateSwipeRefreshAvailability()
                    }

                    delay(250)
                    Log.d(TAG, "Debug stress step $i/$boundedIterations done. Ref: APK-STRESS-STEP")
                }

                Log.i(TAG, "Debug stress completed. Ref: APK-STRESS-OK")
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@MainActivity,
                        "Uji stabilitas selesai. Ref: APK-STRESS-OK",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (error: Exception) {
                Log.e(TAG, "Debug stress failed. Ref: APK-STRESS-ERR", error)
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@MainActivity,
                        "Uji stabilitas gagal. Ref: APK-STRESS-ERR",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } finally {
                withContext(Dispatchers.Main) {
                    isRunningDebugStress = false
                    setLoginSubmitting(false)
                    binding.debugStressButton.isEnabled = true
                    binding.loadingPanel.visibility = View.GONE
                    binding.webRefreshLayout.visibility = View.GONE
                    updateSwipeRefreshAvailability()
                }
            }
        }
    }

    private fun applyBootstrapCookie(
        session: NativeAuthSession,
        bootstrapCookie: String?,
        onApplied: () -> Unit
    ) {
        val cookieValue = runCatching {
            if (!bootstrapCookie.isNullOrBlank()) {
                normalizeBootstrapCookie(bootstrapCookie)
            } else {
                buildBootstrapCookieValue(session)
            }
        }.getOrElse { error ->
            Log.w(TAG, "Failed to prepare bootstrap cookie.", error)
            null
        }

        if (cookieValue.isNullOrBlank()) {
            onApplied()
            return
        }

        try {
            CookieManager.getInstance().setCookie(webBaseUrl, cookieValue) {
                binding.rootContainer.post {
                    Log.d(TAG, "Bootstrap cookie applied. success=$it")
                    onApplied()
                }
            }
        } catch (error: Exception) {
            Log.w(TAG, "Failed to apply bootstrap cookie.", error)
            onApplied()
        }
    }

    private fun buildBootstrapCookieValue(session: NativeAuthSession): String {
        val sessionJson = session.toBridgeJson()
        val base64 = Base64.encodeToString(sessionJson.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        val encoded = URLEncoder.encode(base64, Charsets.UTF_8.name())
        val secureFlag = if (webBaseUrl.startsWith("https")) "; Secure" else ""
        return "absensiku_native_session=$encoded; Path=/; Max-Age=120; SameSite=Lax$secureFlag"
    }

    private fun normalizeBootstrapCookie(cookieHeader: String): String? {
        return cookieHeader.split(",")
            .firstOrNull { it.contains("absensiku_native_session=") }
            ?.trim()
            ?: cookieHeader.trim().takeIf { it.isNotBlank() }
    }

    private fun setBootstrapCookie(session: NativeAuthSession) {
        try {
            val cookieValue = buildBootstrapCookieValue(session)
            CookieManager.getInstance().setCookie(webBaseUrl, cookieValue)
            Log.d(TAG, "Bootstrap cookie set for WebView.")
        } catch (error: Exception) {
            Log.w(TAG, "Failed to set bootstrap cookie.", error)
        }
    }

    private fun setBootstrapCookieFromHeader(cookieHeader: String) {
        try {
            val normalized = normalizeBootstrapCookie(cookieHeader)

            if (normalized.isNullOrBlank()) {
                Log.w(TAG, "Bootstrap cookie header empty.")
                return
            }

            CookieManager.getInstance().setCookie(webBaseUrl, normalized)
            Log.d(TAG, "Bootstrap cookie copied from API response.")
        } catch (error: Exception) {
            Log.w(TAG, "Failed to set bootstrap cookie from header.", error)
        }
    }

    private fun expireBootstrapCookie(onComplete: (() -> Unit)? = null) {
        try {
            val secureFlag = if (webBaseUrl.startsWith("https")) "; Secure" else ""
            val cookieValue = "absensiku_native_session=; Path=/; Max-Age=0; SameSite=Lax$secureFlag"
            CookieManager.getInstance().setCookie(webBaseUrl, cookieValue) {
                binding.rootContainer.post { onComplete?.invoke() }
            }
        } catch (error: Exception) {
            Log.w(TAG, "Failed to expire bootstrap cookie.", error)
            onComplete?.invoke()
        }
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

    private fun applySystemInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.rootContainer) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                systemBars.bottom
            )
            insets
        }
        ViewCompat.requestApplyInsets(binding.rootContainer)
    }

    private fun handleUrlOverride(uri: Uri?): Boolean {
        val url = uri?.toString().orEmpty()
        if (url.isBlank()) return true
        if (!isAllowedUrl(url)) return true

        val path = uri?.path.orEmpty()

        // Redirect /employee/login ke dashboard jika ada pending session
        if (path == "/employee/login") {
            if (bootstrapSessionState.hasPendingSession() || bootstrapSessionState.wasConsumed()) {
                // Ada session bootstrap, redirect ke dashboard
                runOnUiThread {
                    webView?.loadUrl(bootstrapUrl)
                }
                return true
            }
            // Tidak ada session, kembali ke native login
            runOnUiThread {
                showNativeLogin(statusMessage = getString(R.string.login_status_ready))
            }
            return true
        }

        return false
    }

    private fun isAllowedUrl(url: String): Boolean {
        return try {
            val uri = URI(url)
            val isDebugLocalHost = BuildConfig.DEBUG && (
                allowedHost.equals("10.0.2.2", ignoreCase = true) ||
                    allowedHost.equals("10.0.3.2", ignoreCase = true) ||
                    allowedHost.equals("127.0.0.1", ignoreCase = true) ||
                    allowedHost.equals("localhost", ignoreCase = true)
                )
            val allowedScheme = if (isDebugLocalHost) {
                uri.scheme == "https" || uri.scheme == "http"
            } else {
                uri.scheme == "https"
            }

            allowedScheme && uri.host.equals(allowedHost, ignoreCase = true)
        } catch (_: Exception) {
            false
        }
    }

    private fun getSupabaseConfigMismatchMessage(): String? {
        val urlProjectRef = extractSupabaseProjectRefFromUrl(BuildConfig.SUPABASE_URL)
        val keyProjectRef = extractSupabaseProjectRefFromApiKey(BuildConfig.SUPABASE_PUBLISHABLE_KEY)

        if (urlProjectRef.isNullOrBlank() || keyProjectRef.isNullOrBlank()) {
            return null
        }

        if (urlProjectRef == keyProjectRef) {
            return null
        }

        return getString(
            R.string.login_error_config_mismatch,
            urlProjectRef,
            keyProjectRef
        )
    }

    private fun extractSupabaseProjectRefFromUrl(url: String): String? {
        return runCatching {
            val host = URI(url).host ?: return null
            host.substringBefore(".supabase.co").takeIf { it.isNotBlank() }
        }.getOrNull()
    }

    private fun extractSupabaseProjectRefFromApiKey(apiKey: String): String? {
        val jwtSegments = apiKey.split(".")
        if (jwtSegments.size < 2) {
            return null
        }

        return runCatching {
            val payloadSegment = jwtSegments[1]
            val normalized = when (payloadSegment.length % 4) {
                2 -> "$payloadSegment=="
                3 -> "$payloadSegment="
                else -> payloadSegment
            }
            val decoded = Base64.decode(normalized, Base64.URL_SAFE or Base64.NO_WRAP)
            JSONObject(String(decoded, Charsets.UTF_8)).optString("ref").takeIf { it.isNotBlank() }
        }.getOrNull()
    }

    private inner class HybridBridge {
        @JavascriptInterface
        fun getAndroidId(): String {
            val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            return if (androidId.isNullOrBlank()) {
                "AND-${BuildConfig.APPLICATION_ID}-${Build.VERSION.SDK_INT}"
            } else {
                "AND-$androidId"
            }
        }

        @JavascriptInterface
        fun getAndroidVersion(): Int {
            return Build.VERSION.SDK_INT
        }

        @JavascriptInterface
        fun getAppCode(): String {
            return BuildConfig.APP_CODE
        }

        @JavascriptInterface
        fun isRememberSessionEnabled(): Boolean {
            return rememberEnabledCache
        }

        @JavascriptInterface
        fun consumeBootstrapSession(): String? {
            val sessionJson = bootstrapSessionState.consume()
            Log.d(
                TAG,
                "consumeBootstrapSession called, returning: ${if (sessionJson != null) "session data (${sessionJson.length} chars)" else "null"}"
            )
            return sessionJson
        }

        @JavascriptInterface
        fun syncWebSession(sessionJson: String?) {
            Log.d(TAG, "syncWebSession called with: ${if (sessionJson != null) "session data (${sessionJson.length} chars)" else "null"}")
            if (!rememberEnabledCache || sessionJson.isNullOrBlank()) {
                Log.w(TAG, "syncWebSession: session storage not enabled or session is null")
                return
            }
            val raw = sessionJson
            lifecycleScope.launch {
                val parsedSession = withContext(Dispatchers.IO) {
                    NativeAuthSession.fromJson(raw)?.copy(rememberSession = true)
                } ?: return@launch
                activeAuthSession = parsedSession
                withContext(Dispatchers.IO) { sessionStore.saveSession(parsedSession) }
                Log.d(TAG, "syncWebSession: session saved successfully")
            }
        }

        @JavascriptInterface
        fun clearRememberedSession() {
            Log.d(TAG, "clearRememberedSession called")
            deactivatePushForCurrentSession()
            rememberEnabledCache = false
            lifecycleScope.launch(Dispatchers.IO) {
                sessionStore.clearSession()
                sessionStore.clearLastEmail()
            }
        }

        @JavascriptInterface
        fun showNativeLogin(message: String?) {
            Log.d(TAG, "showNativeLogin called with message: $message")
            deactivatePushForCurrentSession()
            runOnUiThread {
                showNativeLogin(
                    statusMessage = getString(R.string.login_status_ready),
                    errorMessage = message?.takeIf { it.isNotBlank() }
                )
            }
        }

        @JavascriptInterface
        fun notifySessionBootstrapComplete() {
            Log.d(TAG, "notifySessionBootstrapComplete called")
            runOnUiThread {
                showBootstrapSuccess()
            }
        }

        @JavascriptInterface
        fun notifySessionBootstrapFailed(message: String?) {
            Log.d(TAG, "notifySessionBootstrapFailed called with: $message")
            runOnUiThread {
                showBootstrapFailure(
                    message?.takeIf { it.isNotBlank() }
                        ?: getString(R.string.login_error_bootstrap_failed),
                    clearStoredSession = false
                )
            }
        }
    }

    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()
}
