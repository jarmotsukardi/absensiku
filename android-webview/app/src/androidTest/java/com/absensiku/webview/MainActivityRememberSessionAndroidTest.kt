package com.absensiku.webview

import android.Manifest
import android.content.Context
import android.view.View
import android.widget.EditText
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.Visibility
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.isNotChecked
import androidx.test.espresso.matcher.ViewMatchers.withEffectiveVisibility
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityRememberSessionAndroidTest {
    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    private val appContext: Context
        get() = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        clearStoredState()
    }

    @Test
    fun startup_withRememberDisabled_clearsPersistedEmailAndSession() {
        val store = NativeSessionStore(appContext)
        store.saveSession(sampleSession(rememberSession = false))
        store.setRememberEnabled(false)
        store.setLastEmail("pegawai@example.com")

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForCondition(scenario) { activity ->
                activity.findViewById<View>(R.id.loginPanel).visibility == View.VISIBLE
            }

            onView(withId(R.id.loginPanel)).check(matches(isDisplayed()))
            onView(withId(R.id.loadingPanel))
                .check(matches(withEffectiveVisibility(Visibility.GONE)))
            onView(withId(R.id.rememberSessionCheck)).check(matches(isNotChecked()))

            scenario.onActivity { activity ->
                val emailText = activity.findViewById<EditText>(R.id.emailEdit).text.toString()
                val activityStore = NativeSessionStore(activity)

                assertEquals("", emailText)
                assertNull(activityStore.getStoredSession())
                assertEquals("", activityStore.getLastEmail())
                assertFalse(activityStore.isRememberEnabled())
            }
        }
    }

    @Test
    fun startup_withRememberEnabled_startsBootstrapFlow() {
        val session = sampleSession(rememberSession = true)
        val store = NativeSessionStore(appContext)
        store.saveSession(session)
        store.setRememberEnabled(true)
        store.setLastEmail(session.email.orEmpty())

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForCondition(scenario) { activity ->
                activity.findViewById<View>(R.id.loadingPanel).visibility == View.VISIBLE &&
                    activity.findViewById<View>(R.id.loginPanel).visibility == View.GONE &&
                    activity.findViewById<View>(R.id.webViewContainer).visibility == View.VISIBLE
            }

            onView(withId(R.id.loadingPanel)).check(matches(isDisplayed()))
            onView(withId(R.id.loginPanel))
                .check(matches(withEffectiveVisibility(Visibility.GONE)))

            scenario.onActivity { activity ->
                val activityStore = NativeSessionStore(activity)
                val persisted = activityStore.getStoredSession()

                assertNotNull(persisted)
                assertEquals(session.accessToken, persisted?.accessToken)
                assertEquals(session.email, activityStore.getLastEmail())
                assertEquals(true, activityStore.isRememberEnabled())
            }
        }
    }

    @Test
    fun hybridBridge_logoutClearsRememberedStateAndShowsNativeLogin() {
        val session = sampleSession(rememberSession = true)
        val store = NativeSessionStore(appContext)
        store.saveSession(session)
        store.setRememberEnabled(true)
        store.setLastEmail(session.email.orEmpty())

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                invokeHybridBridge(activity, "clearRememberedSession")
                invokeHybridBridge(activity, "showNativeLogin", "Sesi telah berakhir. Silakan login kembali.")
            }

            waitForCondition(scenario) { activity ->
                val activityStore = NativeSessionStore(activity)
                activity.findViewById<View>(R.id.loginPanel).visibility == View.VISIBLE &&
                    activityStore.getStoredSession() == null &&
                    activityStore.getLastEmail().isBlank() &&
                    !activityStore.isRememberEnabled()
            }

            onView(withId(R.id.loginPanel)).check(matches(isDisplayed()))
            onView(withId(R.id.webViewContainer))
                .check(matches(withEffectiveVisibility(Visibility.GONE)))

            scenario.onActivity { activity ->
                val errorText = activity.findViewById<TextView>(R.id.loginErrorText).text.toString()
                val activityStore = NativeSessionStore(activity)

                assertEquals("Sesi telah berakhir. Silakan login kembali.", errorText)
                assertNull(activityStore.getStoredSession())
                assertEquals("", activityStore.getLastEmail())
                assertFalse(activityStore.isRememberEnabled())
            }
        }
    }

    private fun clearStoredState() {
        val store = NativeSessionStore(appContext)
        store.clearSession()
        store.clearLastEmail()
        store.clearTenantInfo()
    }

    private fun sampleSession(rememberSession: Boolean): NativeAuthSession {
        return NativeAuthSession(
            accessToken = "access-token",
            refreshToken = "refresh-token",
            expiresAt = 1893456000L,
            expiresIn = 3600L,
            tokenType = "bearer",
            userId = "user-1",
            email = "pegawai@example.com",
            rememberSession = rememberSession
        )
    }

    private fun waitForCondition(
        scenario: ActivityScenario<MainActivity>,
        timeoutMs: Long = 8_000,
        condition: (MainActivity) -> Boolean
    ) {
        val deadline = System.currentTimeMillis() + timeoutMs
        var satisfied = false
        var lastError: Throwable? = null

        while (System.currentTimeMillis() < deadline && !satisfied) {
            scenario.onActivity { activity ->
                try {
                    satisfied = condition(activity)
                } catch (error: Throwable) {
                    lastError = error
                }
            }
            if (!satisfied) Thread.sleep(200)
        }

        if (!satisfied) {
            throw AssertionError("Condition not met within ${timeoutMs}ms", lastError)
        }
    }

    private fun invokeHybridBridge(activity: MainActivity, methodName: String, vararg args: Any?) {
        val bridgeClass = Class.forName("com.absensiku.webview.MainActivity\$HybridBridge")
        val constructor = bridgeClass.getDeclaredConstructor(MainActivity::class.java)
        constructor.isAccessible = true
        val bridgeInstance = constructor.newInstance(activity)
        val method = bridgeClass.declaredMethods.first {
            it.name == methodName && it.parameterTypes.size == args.size
        }
        method.isAccessible = true
        method.invoke(bridgeInstance, *args)
    }
}
