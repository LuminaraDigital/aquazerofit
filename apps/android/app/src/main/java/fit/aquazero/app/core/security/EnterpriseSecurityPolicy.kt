package fit.aquazero.app.core.security

import android.content.Context
import android.content.RestrictionsManager
import android.content.SharedPreferences
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
        val domain = normalizeDomain(allowedEmailDomain) ?: return true
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

        private fun normalizeDomain(raw: String?): String? =
            raw?.trim()?.trimStart('@')?.lowercase()?.takeIf { it.isNotEmpty() }

        fun fromMap(raw: Map<String, Any?>): ManagedRestrictions =
            ManagedRestrictions(
                forceAppLock = raw[KEY_FORCE_APP_LOCK] == true,
                forceScreenCaptureProtection = raw[KEY_FORCE_SCREEN_CAPTURE] == true,
                disableDataExport = raw[KEY_DISABLE_DATA_EXPORT] == true,
                allowedEmailDomain = normalizeDomain(raw[KEY_ALLOWED_EMAIL_DOMAIN] as? String),
            )

        fun fromBundle(bundle: Bundle?): ManagedRestrictions {
            if (bundle == null) return ManagedRestrictions()
            return ManagedRestrictions(
                forceAppLock = bundle.getBoolean(KEY_FORCE_APP_LOCK, false),
                forceScreenCaptureProtection = bundle.getBoolean(KEY_FORCE_SCREEN_CAPTURE, false),
                disableDataExport = bundle.getBoolean(KEY_DISABLE_DATA_EXPORT, false),
                allowedEmailDomain = normalizeDomain(bundle.getString(KEY_ALLOWED_EMAIL_DOMAIN)),
            )
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

    fun isEmailAllowed(email: String): Boolean = restrictions.isEmailAllowed(email)

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
 * Persists user device-security toggles, merges them with live MDM
 * [RestrictionsManager] application restrictions, and tracks the app-lock
 * background session state across Activity configuration changes.
 */
@Singleton
class DeviceSecurityController private constructor(
    private val prefs: SharedPreferences?,
    private val restrictionsManager: RestrictionsManager?,
    initialState: DeviceSecurityState,
) {
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) : this(
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
        restrictionsManager = context.getSystemService(Context.RESTRICTIONS_SERVICE) as? RestrictionsManager,
        initialState = DeviceSecurityState(),
    ) {
        refreshRestrictions()
    }

    /** In-memory constructor for unit and Compose UI tests. */
    constructor(initialState: DeviceSecurityState = DeviceSecurityState()) : this(
        prefs = null,
        restrictionsManager = null,
        initialState = initialState,
    )

    private var userAppLockMem: Boolean = initialState.userAppLockEnabled
    private var userScreenCaptureMem: Boolean = initialState.userScreenCaptureProtectionEnabled
    private val timeoutSeconds: Long = initialState.appLockTimeoutSeconds
    private val initialRestrictions: ManagedRestrictions = initialState.restrictions
    private var restrictionsOverride: ManagedRestrictions? = null

    private var backgroundedAtElapsedMs: Long? = null
    private var lockRequired: Boolean = false
    private var credentialPromptInFlight: Boolean = false
    private var suppressPromptUntilStopped: Boolean = false

    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<DeviceSecurityState> = _state.asStateFlow()

    fun refreshRestrictions() {
        _state.value = loadState()
        if (!_state.value.effectiveAppLockEnabled) {
            clearLockSession()
        }
    }

    fun setUserAppLockEnabled(enabled: Boolean) {
        userAppLockMem = enabled
        prefs?.edit()?.putBoolean(PREF_USER_APP_LOCK, enabled)?.apply()
        _state.value = loadState()
        if (!_state.value.effectiveAppLockEnabled) {
            clearLockSession()
        }
    }

    fun setUserScreenCaptureProtectionEnabled(enabled: Boolean) {
        userScreenCaptureMem = enabled
        prefs?.edit()?.putBoolean(PREF_USER_SCREEN_CAPTURE, enabled)?.apply()
        _state.value = loadState()
    }

    /** Override MDM restrictions in unit or instrumented tests (`null` restores live restrictions). */
    fun setRestrictionsOverrideForTesting(restrictions: ManagedRestrictions?) {
        restrictionsOverride = restrictions
        refreshRestrictions()
    }

    /**
     * Record when the UI leaves the foreground.
     *
     * Does not overwrite [backgroundedAtElapsedMs] during configuration changes,
     * while the system credential sheet is on screen, or while [lockRequired] is
     * already latched after a cancelled unlock prompt.
     */
    fun onAppStopped(nowElapsedMs: Long, isChangingConfigurations: Boolean) {
        suppressPromptUntilStopped = false
        if (!isChangingConfigurations && !credentialPromptInFlight && !lockRequired) {
            backgroundedAtElapsedMs = nowElapsedMs
        }
    }

    /**
     * Evaluate whether `MainActivity` must launch the system credential unlock
     * prompt on `onStart()`. Latches [lockRequired] until [onUnlockPromptResult]
     * succeeds so cancelling the credential screen and reopening the app cannot
     * bypass the timeout.
     */
    fun shouldLaunchUnlockPrompt(nowElapsedMs: Long, isDeviceSecure: Boolean): Boolean {
        val current = _state.value
        if (!current.effectiveAppLockEnabled || !isDeviceSecure) {
            clearLockSession()
            return false
        }
        if (suppressPromptUntilStopped || credentialPromptInFlight) {
            return false
        }
        if (lockRequired || current.shouldLockAfterBackground(backgroundedAtElapsedMs, nowElapsedMs)) {
            lockRequired = true
            credentialPromptInFlight = true
            return true
        }
        backgroundedAtElapsedMs = null
        return false
    }

    fun onUnlockPromptLaunchFailed() {
        clearLockSession()
    }

    /**
     * Handle the result of `KeyguardManager.createConfirmDeviceCredentialIntent`.
     *
     * @return `true` when unlocked; `false` when cancelled/failed (caller must
     *   `moveTaskToBack(true)` while [lockRequired] stays latched).
     */
    fun onUnlockPromptResult(unlocked: Boolean): Boolean {
        credentialPromptInFlight = false
        if (unlocked) {
            clearLockSession()
            return true
        }
        lockRequired = true
        suppressPromptUntilStopped = true
        return false
    }

    private fun clearLockSession() {
        backgroundedAtElapsedMs = null
        lockRequired = false
        credentialPromptInFlight = false
        suppressPromptUntilStopped = false
    }

    private fun loadState(): DeviceSecurityState {
        val liveRestrictions = restrictionsManager?.let { mgr ->
            runCatching { ManagedRestrictions.fromBundle(mgr.applicationRestrictions) }
                .getOrDefault(ManagedRestrictions())
        } ?: initialRestrictions
        val restrictions = restrictionsOverride ?: liveRestrictions
        val appLock = prefs?.getBoolean(PREF_USER_APP_LOCK, false) ?: userAppLockMem
        val screenCapture =
            prefs?.getBoolean(PREF_USER_SCREEN_CAPTURE, false) ?: userScreenCaptureMem
        return DeviceSecurityState(
            userAppLockEnabled = appLock,
            userScreenCaptureProtectionEnabled = screenCapture,
            appLockTimeoutSeconds = timeoutSeconds,
            restrictions = restrictions,
        )
    }

    companion object {
        private const val PREFS_NAME = "azf_device_security"
        private const val PREF_USER_APP_LOCK = "user_app_lock_enabled"
        private const val PREF_USER_SCREEN_CAPTURE = "user_screen_capture_protection_enabled"
    }
}
