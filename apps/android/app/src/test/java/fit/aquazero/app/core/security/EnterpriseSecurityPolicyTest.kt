package fit.aquazero.app.core.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EnterpriseSecurityPolicyTest {

    @Test
    fun `ManagedRestrictions defaults are permissive and unconfigured`() {
        val restrictions = ManagedRestrictions.fromMap(emptyMap())
        assertFalse(restrictions.forceAppLock)
        assertFalse(restrictions.forceScreenCaptureProtection)
        assertFalse(restrictions.disableDataExport)
        assertNull(restrictions.allowedEmailDomain)
        assertTrue(restrictions.isEmailAllowed("anyone@anywhere.org"))
    }

    @Test
    fun `ManagedRestrictions reads restriction keys and ignores consent keys`() {
        val raw = mapOf<String, Any?>(
            ManagedRestrictions.KEY_FORCE_APP_LOCK to true,
            ManagedRestrictions.KEY_FORCE_SCREEN_CAPTURE to true,
            ManagedRestrictions.KEY_DISABLE_DATA_EXPORT to true,
            ManagedRestrictions.KEY_ALLOWED_EMAIL_DOMAIN to " @Example.COM ",
            "wellnessDataProcessing" to true,
            "aiPersonalisation" to true,
            "anonymisedAnalytics" to true,
            "reminders" to true,
            "foodPhotoTraining" to true,
        )
        val restrictions = ManagedRestrictions.fromMap(raw)
        assertTrue(restrictions.forceAppLock)
        assertTrue(restrictions.forceScreenCaptureProtection)
        assertTrue(restrictions.disableDataExport)
        assertEquals("example.com", restrictions.allowedEmailDomain)
    }

    @Test
    fun `isEmailAllowed matches configured domain case-insensitively`() {
        val restrictions = ManagedRestrictions(allowedEmailDomain = "Acme.Corp")
        assertTrue(restrictions.isEmailAllowed("alice@acme.corp"))
        assertTrue(restrictions.isEmailAllowed("BOB@ACME.CORP"))
        assertFalse(restrictions.isEmailAllowed("alice@sub.acme.corp"))
        assertFalse(restrictions.isEmailAllowed("alice@other.com"))
        assertFalse(restrictions.isEmailAllowed("not-an-email"))
        assertFalse(restrictions.isEmailAllowed("@acme.corp"))
    }

    @Test
    fun `DeviceSecurityState combines user toggles with MDM restrictions monotonically`() {
        val defaultState = DeviceSecurityState()
        assertFalse(defaultState.effectiveAppLockEnabled)
        assertFalse(defaultState.effectiveScreenCaptureProtection)
        assertTrue(defaultState.dataExportAllowed)

        val userEnabled = DeviceSecurityState(
            userAppLockEnabled = true,
            userScreenCaptureProtectionEnabled = true,
            restrictions = ManagedRestrictions(
                forceAppLock = false,
                forceScreenCaptureProtection = false,
            ),
        )
        assertTrue(userEnabled.effectiveAppLockEnabled)
        assertTrue(userEnabled.effectiveScreenCaptureProtection)

        val policyForced = DeviceSecurityState(
            userAppLockEnabled = false,
            userScreenCaptureProtectionEnabled = false,
            restrictions = ManagedRestrictions(
                forceAppLock = true,
                forceScreenCaptureProtection = true,
                disableDataExport = true,
            ),
        )
        assertTrue(policyForced.effectiveAppLockEnabled)
        assertTrue(policyForced.effectiveScreenCaptureProtection)
        assertFalse(policyForced.dataExportAllowed)
    }

    @Test
    fun `shouldLockAfterBackground enforces timeout only when app lock is active`() {
        val unlockedState = DeviceSecurityState(userAppLockEnabled = false)
        assertFalse(unlockedState.shouldLockAfterBackground(0L, 600_000L))

        val lockedState = DeviceSecurityState(
            userAppLockEnabled = true,
            appLockTimeoutSeconds = 300L,
        )
        assertFalse(lockedState.shouldLockAfterBackground(null, 600_000L))
        assertFalse(lockedState.shouldLockAfterBackground(10_000L, 309_999L))
        assertTrue(lockedState.shouldLockAfterBackground(10_000L, 310_000L))
        assertTrue(lockedState.shouldLockAfterBackground(10_000L, 500_000L))
    }

    @Test
    fun `DeviceSecurityController latches lock across cancelled prompt and rotation`() {
        val controller = DeviceSecurityController(
            DeviceSecurityState(
                userAppLockEnabled = true,
                appLockTimeoutSeconds = 300L,
            ),
        )

        // Background at t = 1,000 ms; configuration change at t = 50,000 ms must not reset timer.
        controller.onAppStopped(nowElapsedMs = 1_000L, isChangingConfigurations = false)
        controller.onAppStopped(nowElapsedMs = 50_000L, isChangingConfigurations = true)

        // Return after 5 minutes (t = 301,000 ms) -> prompt launches.
        assertTrue(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 301_000L, isDeviceSecure = true))
        // While prompt is in flight, a duplicate onStart does not launch a second prompt.
        assertFalse(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 301_100L, isDeviceSecure = true))

        // User cancels the system credential screen -> returns false, suppresses immediate re-launch
        // in the same onStart frame while moveTaskToBack(true) runs.
        assertFalse(controller.onUnlockPromptResult(unlocked = false))
        assertFalse(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 301_200L, isDeviceSecure = true))

        // moveTaskToBack(true) stops the Activity at t = 301,500 ms -> must NOT overwrite lockRequired.
        controller.onAppStopped(nowElapsedMs = 301_500L, isChangingConfigurations = false)

        // User reopens the app 1 second later (t = 302,500 ms) -> lock is still latched!
        assertTrue(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 302_500L, isDeviceSecure = true))

        // User completes unlock -> lock clears.
        assertTrue(controller.onUnlockPromptResult(unlocked = true))
        assertFalse(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 302_600L, isDeviceSecure = true))
    }

    @Test
    fun `DeviceSecurityController locks a cold start when app lock is enabled`() {
        val controller = DeviceSecurityController(DeviceSecurityState(userAppLockEnabled = true))
        controller.onColdStart()

        // No background timestamp exists after process death, yet the lock still applies.
        assertTrue(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 1_000L, isDeviceSecure = true))
        assertTrue(controller.onUnlockPromptResult(unlocked = true))
        assertFalse(controller.shouldLaunchUnlockPrompt(nowElapsedMs = 2_000L, isDeviceSecure = true))

        val off = DeviceSecurityController(DeviceSecurityState())
        off.onColdStart()
        assertFalse(off.shouldLaunchUnlockPrompt(nowElapsedMs = 1_000L, isDeviceSecure = true))
    }

    @Test
    fun `DeviceSecurityController updates user toggles and MDM overrides`() {
        val controller = DeviceSecurityController()
        assertFalse(controller.state.value.effectiveAppLockEnabled)
        assertTrue(controller.state.value.dataExportAllowed)

        controller.setUserAppLockEnabled(true)
        controller.setUserScreenCaptureProtectionEnabled(true)
        assertTrue(controller.state.value.effectiveAppLockEnabled)
        assertTrue(controller.state.value.effectiveScreenCaptureProtection)

        controller.setUserAppLockEnabled(false)
        controller.setRestrictionsOverrideForTesting(
            ManagedRestrictions(
                forceAppLock = true,
                disableDataExport = true,
                allowedEmailDomain = "corp.example",
            ),
        )
        assertTrue(controller.state.value.effectiveAppLockEnabled)
        assertFalse(controller.state.value.dataExportAllowed)
        assertTrue(controller.state.value.isEmailAllowed("pat@corp.example"))
        assertFalse(controller.state.value.isEmailAllowed("pat@gmail.com"))
    }
}
