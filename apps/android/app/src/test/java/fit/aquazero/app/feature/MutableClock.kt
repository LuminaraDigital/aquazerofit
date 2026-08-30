package fit.aquazero.app.feature

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * A [Clock] whose instant can be moved by hand.
 *
 * `Clock.fixed` pins a test to one moment, which is enough to choose the day a
 * ViewModel is constructed on but not enough to reproduce the bug this exists
 * for: a screen only misfiles a log once a single live instance has seen two
 * different days. Subclassing is the whole mechanism — [Clock] is abstract
 * precisely so a caller can supply its own "now".
 */
class MutableClock(
    private var current: Instant,
    private val zone: ZoneId,
) : Clock() {

    override fun getZone(): ZoneId = zone

    override fun withZone(zone: ZoneId): Clock = MutableClock(current, zone)

    override fun instant(): Instant = current

    /** Move the clock on by [duration] (negative moves it back). */
    fun advance(duration: Duration) {
        current = current.plus(duration)
    }
}
