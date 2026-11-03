package fit.aquazero.app.core.health

import androidx.health.connect.client.HealthConnectClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Availability mapping and the two gates in front of a read.
 *
 * The failure this guards against is not a crash. It is a card that says
 * "unavailable" to someone who only needed to press update, or — much worse —
 * a [HealthConnectStatus.canRead] that comes back true for a user who never
 * connected.
 */
class HealthConnectAvailabilityTest {

    @Test
    fun `the platform statuses map one to one`() {
        assertEquals(
            HealthConnectAvailability.AVAILABLE,
            HealthConnectAvailability.fromSdkStatus(HealthConnectClient.SDK_AVAILABLE),
        )
        assertEquals(
            HealthConnectAvailability.UPDATE_REQUIRED,
            HealthConnectAvailability.fromSdkStatus(
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED,
            ),
        )
        assertEquals(
            HealthConnectAvailability.SDK_UNAVAILABLE,
            HealthConnectAvailability.fromSdkStatus(HealthConnectClient.SDK_UNAVAILABLE),
        )
    }

    @Test
    fun `an unrecognised status fails closed rather than guessing available`() {
        // A future SDK could add a fourth state. Reading under it is the one
        // outcome that must not happen by default.
        assertEquals(
            HealthConnectAvailability.SDK_UNAVAILABLE,
            HealthConnectAvailability.fromSdkStatus(0),
        )
        assertEquals(
            HealthConnectAvailability.SDK_UNAVAILABLE,
            HealthConnectAvailability.fromSdkStatus(99),
        )
        assertEquals(
            HealthConnectAvailability.SDK_UNAVAILABLE,
            HealthConnectAvailability.fromSdkStatus(-1),
        )
    }

    @Test
    fun `reading needs the platform, the permissions and the opt-in`() {
        assertTrue(
            HealthConnectStatus(
                availability = HealthConnectAvailability.AVAILABLE,
                permissionsGranted = true,
                connected = true,
            ).canRead,
        )
    }

    @Test
    fun `a granted permission is not consent on its own`() {
        // The platform grant outlives a disconnect, which is exactly why the
        // app keeps its own flag. Losing this assertion means Disconnect
        // stops the UI without stopping the reads.
        assertFalse(
            HealthConnectStatus(
                availability = HealthConnectAvailability.AVAILABLE,
                permissionsGranted = true,
                connected = false,
            ).canRead,
        )
    }

    @Test
    fun `consent is not a permission either`() {
        assertFalse(
            HealthConnectStatus(
                availability = HealthConnectAvailability.AVAILABLE,
                permissionsGranted = false,
                connected = true,
            ).canRead,
        )
    }

    @Test
    fun `an update-required platform never reads`() {
        assertFalse(
            HealthConnectStatus(
                availability = HealthConnectAvailability.UPDATE_REQUIRED,
                permissionsGranted = true,
                connected = true,
            ).canRead,
        )
    }

    @Test
    fun `an empty snapshot is empty and one figure is enough to make it not`() {
        assertTrue(HealthDaySnapshot.EMPTY.isEmpty)
        assertFalse(HealthDaySnapshot(steps = 1).isEmpty)
        assertFalse(HealthDaySnapshot(sleepMinutes = 1).isEmpty)
        assertFalse(HealthDaySnapshot(energyBurnedKcal = 1).isEmpty)
        assertFalse(HealthDaySnapshot(averageHeartRateBpm = 60).isEmpty)
        assertFalse(HealthDaySnapshot(restingHeartRateBpm = 50).isEmpty)
    }
}
