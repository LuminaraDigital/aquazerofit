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
}
