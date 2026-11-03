package fit.aquazero.app.core.security

import android.content.Context
import android.content.RestrictionsManager
import android.os.Bundle
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Managed configuration restrictions supplied by an enterprise MDM / EMM policy
 * (`res/xml/app_restrictions.xml`, EN-3.3).
 *
 * Product invariant (`CONTRIBUTING.md` / EN-3.3): managed configuration may
 * **only restrict** device behaviour. It must never grant or pre-fill a user
 * consent (`wellnessDataProcessing`, `aiPersonalisation`, `anonymisedAnalytics`,
 * `reminders`, `foodPhotoTraining`). [fromMap] and [fromBundle] read only the
 * four restriction keys below and ignore all consent-shaped keys.
 */
data class ManagedRestrictions(
    val forceAppLock: Boolean = false,
    val forceScreenCaptureProtection: Boolean = false,
    val disableDataExport: Boolean = false,
    val allowedEmailDomain: String? = null,
) {
    /**
     * True when [email] satisfies [allowedEmailDomain] (or when no domain
     * restriction is configured).
     */
    fun isEmailAllowed(email: String): Boolean {
        val domain = allowedEmailDomain?.trim()?.trimStart('@')?.lowercase().orEmpty()
        if (domain.isEmpty()) return true
        val atIndex = email.lastIndexOf('@')
        if (atIndex <= 0 || atIndex == email.lastIndex) return false
        val emailDomain = email.substring(atIndex + 1).trim().lowercase()
        return emailDomain == domain
    }

    companion object {
        const val KEY_FORCE_APP_LOCK = "force_app_lock"
        const val KEY_FORCE_SCREEN_CAPTURE = "force_screen_capture_protection"
        const val KEY_DISABLE_DATA_EXPORT = "disable_data_export"
        const val KEY_ALLOWED_EMAIL_DOMAIN = "allowed_email_domain"

        fun fromMap(raw: Map<String, Any?>): ManagedRestrictions {
            val domain = (raw[KEY_ALLOWED_EMAIL_DOMAIN] as? String)
                ?.trim()
                ?.trimStart('@')
                ?.lowercase()
                ?.takeIf { it.isNotEmpty() }
            return ManagedRestrictions(
                forceAppLock = raw[KEY_FORCE_APP_LOCK] == true,
                forceScreenCaptureProtection = raw[KEY_FORCE_SCREEN_CAPTURE] == true,
                disableDataExport = raw[KEY_DISABLE_DATA_EXPORT] == true,
                allowedEmailDomain = domain,
            )
        }

        fun fromBundle(bundle: Bundle?): ManagedRestrictions {
            if (bundle == null) return ManagedRestrictions()
            val map = mapOf<String, Any?>(
                KEY_FORCE_APP_LOCK to bundle.getBoolean(KEY_FORCE_APP_LOCK, false),
                KEY_FORCE_SCREEN_CAPTURE to bundle.getBoolean(KEY_FORCE_SCREEN_CAPTURE, false),
                KEY_DISABLE_DATA_EXPORT to bundle.getBoolean(KEY_DISABLE_DATA_EXPORT, false),
                KEY_ALLOWED_EMAIL_DOMAIN to bundle.getString(KEY_ALLOWED_EMAIL_DOMAIN),
            )
            return fromMap(map)
        }
    }
}

/**
 * Combined device-security posture (EN-2.1, EN-2.2, EN-3.3).
 *
 * User toggles default to `false`; an MDM restriction can force a control ON
 * (or disable data export), never weaken a user-enabled control or grant a consent.
 */
data class DeviceSecurityState(
    val userAppLockEnabled: Boolean = false,
    val userScreenCaptureProtectionEnabled: Boolean = false,
    val appLockTimeoutSeconds: Long = DEFAULT_APP_LOCK_TIMEOUT_SECONDS,
    val restrictions: ManagedRestrictions = ManagedRestrictions(),
) {
    val effectiveAppLockEnabled: Boolean
        get() = userAppLockEnabled || restrictions.forceAppLock

    val effectiveScreenCaptureProtection: Boolean
        get() = userScreenCaptureProtectionEnabled || restrictions.forceScreenCaptureProtection

    val dataExportAllowed: Boolean
        get() = !restrictions.disableDataExport

    /**
     * True when the app was backgrounded at [backgroundedAtElapsedMs] and has
     * stayed in the background for at least [appLockTimeoutSeconds].
     */
    fun shouldLockAfterBackground(
        backgroundedAtElapsedMs: Long?,
        nowElapsedMs: Long,
    ): Boolean {
        if (!effectiveAppLockEnabled) return false
        val started = backgroundedAtElapsedMs ?: return false
        val elapsedMs = nowElapsedMs - started
        return elapsedMs >= appLockTimeoutSeconds * MILLIS_PER_SECOND
    }

    companion object {
        const val DEFAULT_APP_LOCK_TIMEOUT_SECONDS = 300L
        private const val MILLIS_PER_SECOND = 1_000L
    }
}

/**
 * Persists user device-security toggles and merges them with live MDM
 * [RestrictionsManager] application restrictions.
 */
@Singleton
class DeviceSecurityController @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val restrictionsManager =
        context.getSystemService(Context.RESTRICTIONS_SERVICE) as? RestrictionsManager

    private val _state = MutableStateFlow(loadState())
    val state: StateFlow<DeviceSecurityState> = _state.asStateFlow()

    fun refreshRestrictions() {
        _state.value = loadState()
    }

    fun setUserAppLockEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(PREF_USER_APP_LOCK, enabled).apply()
        _state.value = loadState()
    }

    fun setUserScreenCaptureProtectionEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(PREF_USER_SCREEN_CAPTURE, enabled).apply()
        _state.value = loadState()
    }

    private fun loadState(): DeviceSecurityState {
        val restrictions = runCatching {
            ManagedRestrictions.fromBundle(restrictionsManager?.applicationRestrictions)
        }.getOrDefault(ManagedRestrictions())
        return DeviceSecurityState(
            userAppLockEnabled = prefs.getBoolean(PREF_USER_APP_LOCK, false),
            userScreenCaptureProtectionEnabled = prefs.getBoolean(PREF_USER_SCREEN_CAPTURE, false),
            restrictions = restrictions,
        )
    }

    companion object {
        private const val PREFS_NAME = "azf_device_security"
        private const val PREF_USER_APP_LOCK = "user_app_lock_enabled"
        private const val PREF_USER_SCREEN_CAPTURE = "user_screen_capture_protection_enabled"
    }
}
