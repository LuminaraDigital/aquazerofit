package fit.aquazero.app

import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry

/**
 * Turns the platform animator scale off (and back on) for a test.
 *
 * Two things depend on it. The obvious one is that window and transition
 * animations otherwise race the assertions. The load-bearing one is
 * `rememberReducedMotion()`: at scale 0 the design system's `Skeleton` draws a
 * flat block instead of an `infiniteRepeatable` shimmer, and `revealOnEnter`
 * becomes a no-op. An infinite animation anywhere in the composition means
 * Compose's idle synchronisation never returns, so every `assert*` and
 * `performClick` on a screen that is still loading would hang until the test
 * timed out — with a stack trace pointing at the assertion rather than at the
 * shimmer that caused it.
 *
 * Run through the shell uid, which is the only way an app process can write
 * `Settings.Global`.
 */
internal object SystemAnimations {

    private val SCALES = listOf(
        "window_animation_scale",
        "transition_animation_scale",
        "animator_duration_scale",
    )

    fun disable() = setScale("0.0")

    fun restore() = setScale("1.0")

    private fun setScale(scale: String) {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        SCALES.forEach { setting ->
            val descriptor = automation.executeShellCommand("settings put global $setting $scale")
            // Draining to EOF is what makes this synchronous: the pipe closes
            // when the command exits, so the next composition is guaranteed to
            // read the new value.
            ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { it.readBytes() }
        }
    }
}
