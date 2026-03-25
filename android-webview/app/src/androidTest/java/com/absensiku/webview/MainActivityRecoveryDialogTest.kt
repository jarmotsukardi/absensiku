package com.absensiku.webview

import android.Manifest
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.replaceText
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.RootMatchers.isDialog
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withHint
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityRecoveryDialogTest {
    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun openForgotPasswordDialog_showsRecoveryActions() {
        onView(withId(R.id.forgotPasswordButton)).perform(click())

        onView(withText(R.string.login_forgot_password_title))
            .inRoot(isDialog())
            .check(matches(isDisplayed()))

        onView(withText("Lupa Password"))
            .inRoot(isDialog())
            .check(matches(isDisplayed()))

        onView(withText("Ganti Password"))
            .inRoot(isDialog())
            .check(matches(isDisplayed()))
    }

    @Test
    fun forgotPasswordEmptyFields_showValidationErrors() {
        onView(withId(R.id.forgotPasswordButton)).perform(click())
        onView(withText("Lupa Password")).inRoot(isDialog()).perform(click())
        onView(withText("Via Email")).inRoot(isDialog()).perform(click())

        onView(withHint("Email")).inRoot(isDialog()).perform(replaceText(""))
        onView(withHint("No. WhatsApp")).inRoot(isDialog()).perform(replaceText(""))
        closeSoftKeyboard()

        onView(withText("Kirim Password Baru")).inRoot(isDialog()).perform(click())

        onView(withText(R.string.login_error_email_required))
            .inRoot(isDialog())
            .check(matches(isDisplayed()))
    }

    @Test
    fun forgotPasswordInvalidWhatsapp_showsValidationError() {
        onView(withId(R.id.forgotPasswordButton)).perform(click())
        onView(withText("Lupa Password")).inRoot(isDialog()).perform(click())
        onView(withText("Via Email")).inRoot(isDialog()).perform(click())

        onView(withHint("Email"))
            .inRoot(isDialog())
            .perform(replaceText("pegawai@example.com"))
        onView(withHint("No. WhatsApp"))
            .inRoot(isDialog())
            .perform(replaceText("08123"))
        closeSoftKeyboard()

        onView(withText("Kirim Password Baru")).inRoot(isDialog()).perform(click())

        onView(withText(R.string.login_error_whatsapp_invalid))
            .inRoot(isDialog())
            .check(matches(isDisplayed()))
    }
}
