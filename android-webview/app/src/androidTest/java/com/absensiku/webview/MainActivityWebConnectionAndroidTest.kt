package com.absensiku.webview

import android.Manifest
import android.content.Context
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class MainActivityWebConnectionAndroidTest {
    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    @Test
    fun networkLossWhileWebViewVisible_showsConnectionStatusCard() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                activity.findViewById<View>(R.id.loginPanel).visibility = View.GONE
                activity.findViewById<View>(R.id.webRefreshLayout).visibility = View.VISIBLE
                invokePrivateMethod(activity, "handleNetworkAvailabilityChanged", false)
            }

            waitForCondition(scenario) { activity ->
                activity.findViewById<View>(R.id.webConnectionStatusCard).visibility == View.VISIBLE &&
                    activity.findViewById<View>(R.id.loginPanel).visibility == View.GONE
            }

            onView(withId(R.id.webConnectionStatusCard)).check(matches(isDisplayed()))
            onView(withId(R.id.webConnectionStatusTitle))
                .check(matches(withText(R.string.web_connection_status_title)))

            scenario.onActivity { activity ->
                val message = activity.findViewById<TextView>(R.id.webConnectionStatusMessage)
                    .text
                    .toString()
                assertTrue(message.contains("network_unavailable"))
            }
        }
    }

    @Test
    fun reloadCurrentWebView_withBlankUrlAndNoBootstrap_loadsEmployeeDashboard() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val loadedUrl = AtomicReference<String?>()
            val expectedDashboardUrl = AtomicReference<String>()

            scenario.onActivity { activity ->
                val recordingWebView = RecordingWebView(activity)
                activity.findViewById<FrameLayout>(R.id.webViewContainer).removeAllViews()
                activity.findViewById<FrameLayout>(R.id.webViewContainer).addView(recordingWebView)
                setPrivateField(activity, "webView", recordingWebView)
                activity.findViewById<View>(R.id.webRefreshLayout).visibility = View.VISIBLE
                expectedDashboardUrl.set(getPrivateField(activity, "employeeDashboardUrl") as String)

                invokePrivateMethod(activity, "reloadCurrentWebView")
                loadedUrl.set(recordingWebView.lastLoadedUrl)
            }

            assertEquals(expectedDashboardUrl.get(), loadedUrl.get())
        }
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

    private fun invokePrivateMethod(activity: MainActivity, methodName: String, vararg args: Any?) {
        val method = MainActivity::class.java.declaredMethods.first {
            it.name == methodName && it.parameterTypes.size == args.size
        }
        method.isAccessible = true
        method.invoke(activity, *args)
    }

    private fun setPrivateField(activity: MainActivity, fieldName: String, value: Any?) {
        val field = MainActivity::class.java.getDeclaredField(fieldName)
        field.isAccessible = true
        field.set(activity, value)
    }

    private fun getPrivateField(activity: MainActivity, fieldName: String): Any? {
        val field = MainActivity::class.java.getDeclaredField(fieldName)
        field.isAccessible = true
        return field.get(activity)
    }

    private class RecordingWebView(context: Context) : WebView(context) {
        var lastLoadedUrl: String? = null
            private set

        override fun loadUrl(url: String) {
            lastLoadedUrl = url
        }
    }
}
