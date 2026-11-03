package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.TargetBasedAnimation
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.VectorConverter
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.Modifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The part of the motion system that can be decided without a device.
 *
 * The load-bearing assertions are the equality ones. `revealOnEnter` and
 * `pressScale` used to be `Modifier.composed { }`, which hands back a fresh,
 * non-equal Modifier on every recomposition — so every one of the 43 cards,
 * buttons and chips wearing one failed its modifier equality check and could
 * never skip, strong skipping or not. Two calls with the same arguments now
 * have to compare equal, and that is exactly what these check.
 *
 * The animation itself is not asserted here: a spring settling on a real
 * frame clock needs a device, and the instrumented suite already covers the
 * reduced-motion behaviour end to end.
 */
class MotionModifierTest {

    // -- reveal --------------------------------------------------------------

    @Test
    fun `two reveals at the same index are the same modifier`() {
        assertEquals(Modifier.revealOnEnter(2), Modifier.revealOnEnter(2))
        assertEquals(Modifier.revealOnEnter(2).hashCode(), Modifier.revealOnEnter(2).hashCode())
    }

    @Test
    fun `a reveal defaults to the first stagger slot`() {
        assertEquals(Modifier.revealOnEnter(0), Modifier.revealOnEnter())
    }

    @Test
    fun `reveals at different indices are different modifiers`() {
        assertNotEquals(Modifier.revealOnEnter(0), Modifier.revealOnEnter(1))
    }

    // -- press ---------------------------------------------------------------

    @Test
    fun `two press scales over the same interaction source are the same modifier`() {
        val source = MutableInteractionSource()

        assertEquals(Modifier.pressScale(source), Modifier.pressScale(source))
        assertEquals(Modifier.pressScale(source).hashCode(), Modifier.pressScale(source).hashCode())
    }

    @Test
    fun `press scales over different interaction sources are different modifiers`() {
        assertNotEquals(
            Modifier.pressScale(MutableInteractionSource()),
            Modifier.pressScale(MutableInteractionSource()),
        )
    }

    // -- reveal timing -------------------------------------------------------

    @Test
    fun `the reveal spec is still 600ms of the signature curve`() {
        val spec = AzfMotion.revealSpec<Float>()

        assertTrue("expected a tween, was ${spec::class.java.name}", spec is TweenSpec<*>)
        val tween = spec as TweenSpec<*>
        assertEquals(AzfMotion.RevealDurationMs, tween.durationMillis)
        assertSame(AzfMotion.RevealEasing, tween.easing)
    }

    /**
     * `RevealOnEnterNode` drives fade and rise from one progress value, on the
     * premise that `rise == 1 - alpha` at every frame because both halves share
     * a spec. If that ever stops holding — a different easing for the rise, a
     * delay on one of them — the reveal silently desynchronises, so pin it.
     */
    @Test
    fun `the rise is the exact mirror of the fade`() {
        for (playTimeMs in 0..AzfMotion.RevealDurationMs step 25) {
            val alpha = revealValueAt(from = 0f, to = 1f, playTimeMs = playTimeMs)
            val rise = revealValueAt(from = 1f, to = 0f, playTimeMs = playTimeMs)

            assertEquals("at ${playTimeMs}ms", 1f - alpha, rise, 1e-5f)
        }
    }

    private fun revealValueAt(from: Float, to: Float, playTimeMs: Int): Float =
        TargetBasedAnimation(
            animationSpec = AzfMotion.revealSpec<Float>(),
            typeConverter = Float.VectorConverter,
            initialValue = from,
            targetValue = to,
        ).getValueFromNanos(playTimeMs * NANOS_PER_MILLI)

    private companion object {
        const val NANOS_PER_MILLI = 1_000_000L
    }
}
