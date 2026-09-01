package fit.aquazero.app.core.health

import android.content.Intent
import androidx.activity.result.contract.ActivityResultContract
import kotlinx.coroutines.flow.Flow
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Health Connect as the rest of the app is allowed to see it.
 *
 * The same shape as the repositories in `core/data`: one source hidden behind
 * plain types, so no call site imports `androidx.health.*`. The difference is
 * what the isolation is *for*. Elsewhere it keeps Retrofit out of ViewModels;
 * here it is the enforcement point for a rule that cannot be enforced at each
 * call site — **nothing is read until the user has connected**.
 *
 * That rule is why every read goes through [readable] rather than trusting the
 * caller. Two independent things have to be true, and both are re-checked on
 * every single call:
 *
 *  1. The user turned this on in the app, recorded in
 *     [HealthConnectConsentStore]. Revocable here, and honoured instantly.
 *  2. The platform still grants the permissions. Health Connect's own settings
 *     can withdraw them while this app is backgrounded, and a stale "granted"
 *     would turn every read into a caught `SecurityException` instead of an
 *     honest empty state.
 *
 * A missing gate yields [HealthDaySnapshot.EMPTY] or a false, never an
 * exception. This app is offline-first and a screen does not break because a
 * capability is absent.
 */
@Singleton
class HealthConnectRepository @Inject constructor(
    private val manager: HealthConnectManager,
    private val consentStore: HealthConnectConsentStore,
    private val clock: Clock,
) {

    /** Whether the user has connected, as a stream the UI can observe. */
    val connected: Flow<Boolean> = consentStore.connected

    /** The permission strings a screen hands to the platform's request contract. */
    val permissions: Set<String> get() = manager.permissions

    /** Availability, permissions and opt-in as one value. */
    suspend fun status(): HealthConnectStatus {
        val availability = manager.availability()
        val granted = availability == HealthConnectAvailability.AVAILABLE &&
            manager.hasAllPermissions()
        return HealthConnectStatus(
            availability = availability,
            permissionsGranted = granted,
            connected = consentStore.current(),
        )
    }

    /**
     * Record the opt-in, but only if the platform really did grant everything.
     *
     * Called after the permission sheet returns. The sheet's own result is not
     * trusted as the answer: a user can approve four of five toggles, and
     * storing "connected" off a partial grant would leave the card claiming a
     * connection whose reads all come back empty.
     */
    suspend fun connect(): Boolean {
        val granted = manager.hasAllPermissions()
        if (granted) consentStore.setConnected(true)
        return granted
    }

    /**
     * Stop reading, immediately.
     *
     * This does not revoke the platform grant, and deliberately does not
     * pretend to: an app cannot silently drop another app's permissions, and
     * one that claimed to would be lying about where the data can still go.
     * The card links to Health Connect's own settings for that. What this does
     * guarantee is the part this app controls — after it returns, every read
     * below is refused at gate 1 regardless of what the platform still allows.
     */
    suspend fun disconnect() {
        consentStore.setConnected(false)
    }

    /** Today's figures in the device's current zone. */
    suspend fun todaySnapshot(): HealthDaySnapshot = snapshot(LocalDate.now(clock))

    /** One local day's figures, or [HealthDaySnapshot.EMPTY] if not permitted. */
    suspend fun snapshot(date: LocalDate): HealthDaySnapshot {
        if (!readable()) return HealthDaySnapshot.EMPTY
        return HealthDaySnapshot(
            steps = manager.readDailySteps(date),
            averageHeartRateBpm = manager.readAverageHeartRate(date),
            restingHeartRateBpm = manager.readRestingHeartRate(date),
            sleepMinutes = manager.readSleepMinutes(date),
            energyBurnedKcal = manager.readEnergyBurnedKcal(date),
        )
    }

    /**
     * Push a weight logged in this app out to the platform. Returns false when
     * nothing was written, which callers are expected to ignore: the in-app
     * log is the record of truth and Health Connect is a copy.
     */
    suspend fun publishWeight(kg: Double, at: Instant): Boolean {
        if (!readable()) return false
        return manager.writeWeight(kg, at)
    }

    /** The contract a screen launches to show the permission sheet. */
    fun permissionRequestContract(): ActivityResultContract<Set<String>, Set<String>> =
        manager.permissionRequestContract()

    /** Health Connect's own settings, for reviewing or revoking the grant. */
    fun settingsIntent(): Intent = manager.settingsIntent()

    /** The Play listing, for a device below Android 14 without the app. */
    fun providerInstallIntent(): Intent = manager.providerInstallIntent()

    /**
     * Both gates, re-read every time.
     *
     * Ordered opt-in first because it is a local read and the permission check
     * is an IPC — but more importantly because it is the gate the user set. If
     * they have disconnected, the app has no business asking the platform
     * anything, even a question as harmless as which permissions it holds.
     */
    private suspend fun readable(): Boolean =
        consentStore.current() && manager.hasAllPermissions()
}
