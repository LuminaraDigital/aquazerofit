package fit.aquazero.app.feature.gamification

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.tooling.preview.Preview
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

/**
 * Brand confetti: aqua, mint and coral, and nothing else.
 *
 * The palette is a product rule wearing a party hat. This app shows a person
 * their weight; gold-and-red carnival confetti is the visual grammar of a
 * slot machine, and red in particular is reserved — coral is the only warm
 * colour in the system precisely so that "your weight went up" never lands as
 * an alarm. A celebration that borrowed a warning colour would spend the
 * product's most careful decision on a two-second flourish.
 *
 * Drawn on one [Canvas] from a seeded particle table — no library, no Lottie,
 * no bitmap. Under reduced motion it renders nothing at all: the outcome is
 * carried by the card behind it, which stays fully legible without a single
 * moving pixel.
 */
private data class Particle(
    val x: Float,
    val delay: Float,
    val drift: Float,
    val spin: Float,
    val widthDp: Float,
    val heightDp: Float,
    val colour: Color,
    val sway: Float,
)

/** The only colours confetti may use. */
private val BrandConfetti = listOf(
    AzfColors.PrimaryFixedDim,
    AzfColors.SecondaryFixedDim,
    AzfColors.Coral,
    AzfColors.Primary,
    AzfColors.SecondaryFixed,
)

private const val PARTICLE_COUNT = 46
private const val FALL_DURATION_MS = 2600

@Composable
fun Confetti(
    playing: Boolean,
    modifier: Modifier = Modifier,
    seed: Int = 0,
) {
    val reducedMotion = rememberReducedMotion()
    if (reducedMotion) return

    val particles = remember(seed) {
        val random = Random(seed * 31 + 7)
        List(PARTICLE_COUNT) {
            Particle(
                x = random.nextFloat(),
                delay = random.nextFloat() * 0.35f,
                drift = random.nextFloat() * 0.3f - 0.15f,
                spin = random.nextFloat() * 6f - 3f,
                widthDp = 5f + random.nextFloat() * 5f,
                heightDp = 9f + random.nextFloat() * 7f,
                colour = BrandConfetti[random.nextInt(BrandConfetti.size)],
                sway = 0.6f + random.nextFloat() * 1.8f,
            )
        }
    }

    // An Animatable rather than updateTransition: the overlay composes with
    // `playing` already true, and a transition whose target equals its initial
    // state settles instantly — the confetti would be over before the first
    // frame drew.
    val progress = remember(seed) { Animatable(0f) }
    LaunchedEffect(seed, playing) {
        if (!playing) {
            progress.snapTo(0f)
            return@LaunchedEffect
        }
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = FALL_DURATION_MS, easing = LinearEasing),
        )
    }

    Canvas(
        modifier = modifier
            .fillMaxSize()
            // Decorative: the celebration's meaning is in the card's text, and
            // a screen reader announcing forty-six paper rectangles is noise.
            .clearAndSetSemantics { },
    ) {
        val elapsed = progress.value
        if (elapsed <= 0f) return@Canvas
        val density = this.density
        particles.forEach { particle ->
            val local = ((elapsed - particle.delay) / (1f - particle.delay)).coerceIn(0f, 1f)
            if (local <= 0f) return@forEach
            val fall = local * (size.height + 160f) - 80f
            val swayPx = sin(local * particle.sway * 2f * PI.toFloat()) * 28f
            val x = particle.x * size.width + swayPx + particle.drift * size.width * local
            // Fade out over the last third so pieces leave rather than vanish.
            val alpha = if (local > 0.66f) ((1f - local) / 0.34f).coerceIn(0f, 1f) else 1f
            val w = particle.widthDp * density
            val h = particle.heightDp * density
            rotate(degrees = local * particle.spin * 360f, pivot = Offset(x + w / 2f, fall + h / 2f)) {
                drawRect(
                    color = particle.colour.copy(alpha = alpha * 0.9f),
                    topLeft = Offset(x, fall),
                    size = Size(w, h),
                )
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 320, heightDp = 480)
@Composable
private fun ConfettiPreview() {
    AzfTheme {
        Confetti(playing = true, modifier = Modifier.fillMaxSize(), seed = 3)
    }
}
