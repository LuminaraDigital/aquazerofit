package fit.aquazero.app.core.designsystem

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Shared motion vocabulary. All entrance motion is gated on the system
 * animator duration scale: a user who set animations to zero gets content
 * immediately, with no fade and no rise.
 */
object AzfMotion {
    /** Signature reveal easing — cubic-bezier(0.16, 1, 0.3, 1). */
    val RevealEasing: Easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

    /** Reveal duration in milliseconds. */
    const val RevealDurationMs: Int = 600

    /** Stagger between successive reveal indices, in milliseconds. */
    const val RevealStaggerMs: Long = 80L

    /** Vertical rise distance of the reveal. */
    val RevealRise = 16.dp

    /** Press scale applied to interactive surfaces. */
    const val PressScale: Float = 0.97f

    /** Standard reveal spec (fade + rise). */
    fun <T> revealSpec(): FiniteAnimationSpec<T> =
        tween(durationMillis = RevealDurationMs, easing = RevealEasing)
}

/**
 * True when the user has reduced or disabled system animations
 * (animator duration scale == 0).
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    }
}

/**
 * Entrance reveal: fade in + 16dp rise over 600ms with the signature easing,
 * staggered by [index] * 80ms. No-ops entirely under reduced motion.
 */
fun Modifier.revealOnEnter(index: Int = 0): Modifier = composed {
    val reducedMotion = rememberReducedMotion()
    if (reducedMotion) return@composed this

    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(index * AzfMotion.RevealStaggerMs)
        started = true
    }
    val alpha by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = AzfMotion.revealSpec(),
        label = "revealAlpha",
    )
    val rise by animateFloatAsState(
        targetValue = if (started) 0f else 1f,
        animationSpec = AzfMotion.revealSpec(),
        label = "revealRise",
    )
    val risePx = with(androidx.compose.ui.platform.LocalDensity.current) {
        AzfMotion.RevealRise.toPx()
    }
    graphicsLayer {
        this.alpha = alpha
        translationY = rise * risePx
    }
}

/**
 * Press feedback: scales the element to [AzfMotion.PressScale] while the
 * given [interactionSource] reports a press. Gated on reduced motion.
 */
fun Modifier.pressScale(interactionSource: MutableInteractionSource): Modifier = composed {
    val reducedMotion = rememberReducedMotion()
    if (reducedMotion) return@composed this
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) AzfMotion.PressScale else 1f,
        label = "pressScale",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
