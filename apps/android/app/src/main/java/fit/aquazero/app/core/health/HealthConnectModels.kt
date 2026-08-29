package fit.aquazero.app.core.health

import androidx.health.connect.client.HealthConnectClient

/**
 * Whether this device can serve health data at all.
 *
 * Modelled as three states rather than a boolean because the middle one is
 * actionable and the other two are not: below Android 14 Health Connect is a
 * separate app from the Play Store, so "missing" is an ordinary configuration
 * of a working phone rather than a failure, and "too old" is one tap from
 * being fixed. Collapsing them would leave the card saying "unavailable" to a
 * user who only needed to press update.
 */
enum class HealthConnectAvailability {

    /** No Health Connect on this device, and none installable on this OS. */
    SDK_UNAVAILABLE,

    /** Present, but older than the client library can talk to. */
    UPDATE_REQUIRED,

    /** Present and usable. Says nothing about permissions. */
    AVAILABLE,
    ;

    companion object {

        /**
         * Map the platform's integer status.
         *
         * Anything unrecognised maps to [SDK_UNAVAILABLE]: a status this
         * version of the app has never heard of is one it cannot read data
         * under, and guessing "available" would push the failure down into a
         * call that has no way to explain itself.
         */
        fun fromSdkStatus(sdkStatus: Int): HealthConnectAvailability = when (sdkStatus) {
            HealthConnectClient.SDK_AVAILABLE -> AVAILABLE
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> UPDATE_REQUIRED
            else -> SDK_UNAVAILABLE
        }
    }
}

/**
 * One day's figures as this app is willing to hold them.
 *
 * Every field is nullable and null is the normal case, not an error: Health
 * Connect is unavailable, or the user has not connected, or has granted four
 * of the five permissions, or simply wore nothing to bed. None of those are
 * worth a distinct state, because the screen renders all of them identically —
 * a dash where the number would be.
 *
 * Deliberately narrow. Nothing here carries a timestamp, a device name or a
 * data origin, so there is no route by which a source app or a wear device's
 * identity reaches app storage along with the numbers.
 */
data class HealthDaySnapshot(
    val steps: Long? = null,
    val averageHeartRateBpm: Long? = null,
    val restingHeartRateBpm: Long? = null,
    val sleepMinutes: Long? = null,
    val energyBurnedKcal: Int? = null,
) {

    /** True when the platform gave us nothing at all for this day. */
    val isEmpty: Boolean
        get() = steps == null &&
            averageHeartRateBpm == null &&
            restingHeartRateBpm == null &&
            sleepMinutes == null &&
            energyBurnedKcal == null

    companion object {
        /** The snapshot returned whenever reading is not permitted. */
        val EMPTY = HealthDaySnapshot()
    }
}

/**
 * What the integration can do right now, as one value.
 *
 * [connected] is this app's own record of the user having opted in and is
 * checked first; [permissionsGranted] is the platform's answer and can go
 * false underneath us at any time, because Health Connect's own settings can
 * revoke a grant while this app is in the background.
 */
data class HealthConnectStatus(
    val availability: HealthConnectAvailability,
    val permissionsGranted: Boolean,
    val connected: Boolean,
) {

    /** True only when both gates are open and a read would actually return data. */
    val canRead: Boolean
        get() = availability == HealthConnectAvailability.AVAILABLE &&
            connected &&
            permissionsGranted
}
