package fit.aquazero.app.feature.gamification

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import fit.aquazero.app.core.designsystem.rememberReducedMotion

/**
 * Haptics for the moments that deserve more than a tick.
 *
 * Compose's [HapticFeedback] vocabulary is a set of single events; a level-up
 * wants a *shape* — two quick taps and a longer settle, so the hand feels the
 * bar overshoot and land. That needs the platform [Vibrator] and a waveform,
 * which is why `VIBRATE` is one of the four permissions this app declares.
 *
 * Everything degrades: no vibrator, an amplitude-blind motor, or a user with
 * animations turned off all fall back to a single [HapticFeedbackType.Confirm]
 * or to silence. Reduced motion suppresses the pattern too — someone who
 * turned off animation did not ask for the buzz version of the same flourish.
 */
class CelebrationHaptics internal constructor(
    private val vibrator: Vibrator?,
    private val compose: HapticFeedback,
    private val reducedMotion: Boolean,
) {

    /** Log succeeded: one clean confirmation. */
    fun confirm() {
        compose.performHapticFeedback(HapticFeedbackType.Confirm)
    }

    /** Selection changed: the system's own tick. */
    fun tick() {
        compose.performHapticFeedback(HapticFeedbackType.SegmentTick)
    }

    /** Level-up / rank-up: rise, rise, land. */
    fun celebrate() {
        if (reducedMotion) return
        if (!playWaveform(CELEBRATE_TIMINGS, CELEBRATE_AMPLITUDES)) confirm()
    }

    /** Achievement banner: lighter than a level-up, still a shape. */
    fun achievement() {
        if (reducedMotion) return
        if (!playWaveform(ACHIEVEMENT_TIMINGS, ACHIEVEMENT_AMPLITUDES)) confirm()
    }

    private fun playWaveform(timings: LongArray, amplitudes: IntArray): Boolean {
        val motor = vibrator ?: return false
        if (!motor.hasVibrator()) return false
        return runCatching {
            val effect = if (motor.hasAmplitudeControl()) {
                VibrationEffect.createWaveform(timings, amplitudes, -1)
            } else {
                VibrationEffect.createWaveform(timings, -1)
            }
            motor.vibrate(effect)
            true
        }.getOrDefault(false)
    }

    private companion object {
        /** wait, buzz, wait, buzz, wait, settle. */
        val CELEBRATE_TIMINGS = longArrayOf(0, 28, 60, 28, 70, 120)
        val CELEBRATE_AMPLITUDES = intArrayOf(0, 130, 0, 180, 0, 235)

        val ACHIEVEMENT_TIMINGS = longArrayOf(0, 24, 55, 90)
        val ACHIEVEMENT_AMPLITUDES = intArrayOf(0, 120, 0, 200)
    }
}

/** Composition-scoped [CelebrationHaptics] bound to this device and settings. */
@Composable
fun rememberCelebrationHaptics(): CelebrationHaptics {
    val context = LocalContext.current
    val compose = LocalHapticFeedback.current
    val reducedMotion = rememberReducedMotion()
    return remember(context, compose, reducedMotion) {
        CelebrationHaptics(vibratorOf(context), compose, reducedMotion)
    }
}

private fun vibratorOf(context: Context): Vibrator? = runCatching {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(VibratorManager::class.java)
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Vibrator::class.java)
    }
}.getOrNull()
