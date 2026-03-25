package com.absensiku.webview

import android.Manifest
import android.content.Context
import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityWebLogoutE2eAndroidTest {
    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    private val appContext: Context
        get() = ApplicationProvider.getApplicationContext()

    private val device: UiDevice
        get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    @After
    fun tearDown() {
        val store = NativeSessionStore(appContext)
        store.clearSession()
        store.clearLastEmail()
        store.clearTenantInfo()
    }

    @Test
    fun debugLogin_webLogout_returnsToNativeLoginAndClearsStoredSession() {
        assumeTrue(BuildConfig.DEBUG)
        assumeTrue(BuildConfig.DEBUG_LOGIN_EMAIL.isNotBlank())
        assumeTrue(BuildConfig.DEBUG_LOGIN_PASSWORD.isNotBlank())

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            onView(withId(R.id.rememberSessionCheck)).perform(click())
            onView(withId(R.id.debugStressButton)).perform(click())
            onView(withId(R.id.debugStressButton)).perform(click())

            waitForObject(
                primary = By.desc("employee-dashboard-tab-profile"),
                fallback = By.text("Profil"),
                timeoutMs = 40_000
            )?.click()
            waitForObject(
                primary = By.desc("employee-dashboard-logout-button"),
                fallback = By.text("Keluar"),
                timeoutMs = 20_000,
                swipes = 4
            )?.click()

            waitForCondition(scenario, timeoutMs = 15_000) { activity ->
                val store = NativeSessionStore(activity)
                activity.findViewById<View>(R.id.loginPanel).visibility == View.VISIBLE &&
                    store.getStoredSession() == null &&
                    store.getLastEmail().isBlank() &&
                    !store.isRememberEnabled()
            }

            onView(withId(R.id.loginPanel)).check(matches(isDisplayed()))

            scenario.onActivity { activity ->
                val store = NativeSessionStore(activity)
                assertNull(store.getStoredSession())
                assertFalse(store.isRememberEnabled())
            }
        }
    }

    private fun waitForObject(
        primary: BySelector,
        fallback: BySelector? = null,
        timeoutMs: Long,
        swipes: Int = 0
    ): androidx.test.uiautomator.UiObject2? {
        val found = device.wait(Until.findObject(primary), timeoutMs)
            ?: fallback?.let { device.wait(Until.findObject(it), 1_500) }
        if (found != null) return found

        repeat(swipes) {
            device.swipe(
                device.displayWidth / 2,
                (device.displayHeight * 0.8).toInt(),
                device.displayWidth / 2,
                (device.displayHeight * 0.25).toInt(),
                24
            )
            val afterSwipe = device.wait(Until.findObject(primary), 3_000)
                ?: fallback?.let { device.wait(Until.findObject(it), 1_000) }
            if (afterSwipe != null) return afterSwipe
        }

        return null
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
            if (!satisfied) Thread.sleep(250)
        }

        if (!satisfied) {
            throw AssertionError("Condition not met within ${timeoutMs}ms", lastError)
        }
    }
}
