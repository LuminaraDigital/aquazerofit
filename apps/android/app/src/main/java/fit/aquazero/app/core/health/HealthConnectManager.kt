package fit.aquazero.app.core.health

import android.content.Context
import android.content.Intent
import androidx.activity.result.contract.ActivityResultContract
import androidx.core.net.toUri
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Mass
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The one place in the app that knows `androidx.health.*` exists.
 *
 * Everything above this talks to [HealthConnectRepository] in plain Kotlin
 * types, for the usual reason — a swap or a fake should not touch call sites —
 * and for one specific to this dependency: Health Connect record classes carry
 * far more than the numbers this app wants. A `WeightRecord` knows the device
 * that produced it and the app that wrote it, and a `SleepSessionRecord`
 * carries per-stage timings. Keeping those types inside this file is what
 * stops any of it drifting into a ViewModel, a log line or a cache.
 *
 * **This class holds no state and caches nothing.** Availability, the client
 * and the permission grants are all re-read on every call, because all three
 * change while the app is running: Health Connect can be installed, updated or
 * have a grant revoked from its own settings without this process restarting.
 * A cached "available" is a crash waiting for the uninstall.
 *
 * Nothing here checks whether the user opted in — that gate belongs to the
 * repository, which is the only thing that should be calling these functions.
 */
@Singleton
class HealthConnectManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val clock: Clock,
) {

    /**
     * Exactly what this app asks for, and no more.
     *
     * Four reads and one write. There is deliberately no
     * `READ_RESTING_HEART_RATE`, no `READ_ACTIVE_CALORIES_BURNED` and no
     * `READ_WEIGHT`: each would widen the request screen the user has to
     * approve for a figure already derivable from what is here, and a
     * permission prompt is where an integration loses people.
     */
    val permissions: Set<String> = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class),
    )

    /** Whether the platform is present, out of date, or absent. */
    fun availability(): HealthConnectAvailability =
        HealthConnectAvailability.fromSdkStatus(HealthConnectClient.getSdkStatus(context))

    /** The contract a screen launches to show the platform's permission sheet. */
    fun permissionRequestContract(): ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()

    /** True only when every permission in [permissions] is currently granted. */
    suspend fun hasAllPermissions(): Boolean {
        val controller = client()?.permissionController ?: return false
        val granted = healthCall { controller.getGrantedPermissions() } ?: return false
        return granted.containsAll(permissions)
    }

    /** Steps for the local day [date], or null when unreadable or zero. */
    suspend fun readDailySteps(date: LocalDate): Long? =
        HealthRounding.steps(aggregate(StepsRecord.COUNT_TOTAL, HealthWindows.day(date, zone())))

    /** Mean heart rate across the local day [date]. */
    suspend fun readAverageHeartRate(date: LocalDate): Long? =
        HealthRounding.bpm(aggregate(HeartRateRecord.BPM_AVG, HealthWindows.day(date, zone())))

    /**
     * Resting heart rate for [date], taken as the day's lowest reading.
     *
     * Health Connect has a `RestingHeartRateRecord`, and this does not read
     * it: doing so would mean asking for a sixth permission to obtain a number
     * that only some sources write at all, and whose usual derivation is
     * exactly the minimum computed here. An approximation the user did not
     * have to authorise beats an exact figure most of them would not have.
     */
    suspend fun readRestingHeartRate(date: LocalDate): Long? =
        HealthRounding.bpm(aggregate(HeartRateRecord.BPM_MIN, HealthWindows.day(date, zone())))

    /** Minutes slept during the night that ended on the morning of [date]. */
    suspend fun readSleepMinutes(date: LocalDate): Long? = HealthRounding.sleepMinutes(
        aggregate(SleepSessionRecord.SLEEP_DURATION_TOTAL, HealthWindows.lastNight(date, zone())),
    )

    /**
     * Energy burned across the local day [date], in kilocalories.
     *
     * This is *total* energy — basal metabolism included — because
     * `TotalCaloriesBurnedRecord` is the permission this app asks for. It is
     * therefore not comparable with the "active calories" a workout tracker
     * shows, and the string it is rendered under says so rather than inviting
     * the user to subtract it from a food target.
     */
    suspend fun readEnergyBurnedKcal(date: LocalDate): Int? = HealthRounding.kilocalories(
        aggregate(TotalCaloriesBurnedRecord.ENERGY_TOTAL, HealthWindows.day(date, zone()))
            ?.inKilocalories,
    )

    /**
     * Publish a weight the user logged in this app, so the rest of their
     * health stack sees it. Returns false when nothing was written.
     *
     * Marked as a manual entry rather than a recording, because that is what
     * it is: a number somebody typed. Consumers weight a manual entry
     * differently from a smart scale's, and claiming the latter would corrupt
     * every trend built downstream of it.
     */
    suspend fun writeWeight(kg: Double, at: Instant): Boolean {
        if (!kg.isFinite() || kg <= 0.0) return false
        val client = client() ?: return false
        val record = WeightRecord(
            time = at,
            zoneOffset = null,
            weight = Mass.kilograms(HealthRounding.kilograms(kg)),
            metadata = Metadata.manualEntry(),
        )
        return healthCall { client.insertRecords(listOf(record)) } != null
    }

    /** Health Connect's own settings, where a grant can be reviewed or revoked. */
    fun settingsIntent(): Intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)

    /**
     * The Play listing for the Health Connect app, for devices below Android
     * 14 that do not have it. The `healthconnect://onboarding` deep link makes
     * the store hand the user straight to setup after installing rather than
     * back to an app that still says "unavailable".
     */
    fun providerInstallIntent(): Intent =
        Intent(Intent.ACTION_VIEW)
            .setPackage(PLAY_STORE_PACKAGE)
            .setData(PROVIDER_STORE_URL.toUri())
            .putExtra(EXTRA_OVERLAY, true)
            .putExtra(EXTRA_CALLER_ID, context.packageName)

    /**
     * A client, or null when there is nothing to talk to.
     *
     * `getOrCreate` throws rather than returning null on an unavailable
     * provider, and an exception on a Settings screen tap is not an acceptable
     * way to discover that a phone has no Health Connect.
     */
    private fun client(): HealthConnectClient? {
        if (availability() != HealthConnectAvailability.AVAILABLE) return null
        return try {
            HealthConnectClient.getOrCreate(context)
        } catch (_: IllegalStateException) {
            null
        }
    }

    /** Run one aggregation, or return null if anything at all is in the way. */
    private suspend fun <T : Any> aggregate(metric: AggregateMetric<T>, window: HealthWindow): T? {
        val client = client() ?: return null
        val request = AggregateRequest(
            metrics = setOf(metric),
            timeRangeFilter = TimeRangeFilter.between(window.start, window.end),
        )
        return healthCall { client.aggregate(request) }?.get(metric)
    }

    /**
     * The device's current zone, read from the injected clock on every call so
     * a day boundary is never computed from a zone the user has since left.
     */
    private fun zone(): ZoneId = clock.zone

    private companion object {
        const val PLAY_STORE_PACKAGE = "com.android.vending"

        /**
         * `HealthConnectClient.DEFAULT_PROVIDER_PACKAGE_NAME` is `internal`,
         * so the id has to be repeated here. It is the Play listing this
         * intent opens, not a package the app ever binds to, and it has been
         * stable since Health Connect shipped.
         */
        const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
        const val EXTRA_OVERLAY = "overlay"
        const val EXTRA_CALLER_ID = "callerId"

        /**
         * The trailing url-encoded `healthconnect://onboarding` is what makes
         * the store hand the user straight to setup after installing, rather
         * than back to an app that still says "unavailable".
         */
        const val PROVIDER_STORE_URL =
            "market://details?id=$PROVIDER_PACKAGE" +
                "&url=healthconnect%3A%2F%2Fonboarding"
    }
}
