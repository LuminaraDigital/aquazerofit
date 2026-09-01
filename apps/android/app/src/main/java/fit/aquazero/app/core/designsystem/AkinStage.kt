package fit.aquazero.app.core.designsystem

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Akin's three poses (brand assets in `assets/brand/`). */
enum class AkinPose(val assetPath: String) {
    Idle(BrandAssets.AKIN_IDLE),
    Guard(BrandAssets.AKIN_GUARD),
    Lift(BrandAssets.AKIN_LIFT),
}

/**
 * The interactive mascot stage: float-bob (±10px / ±0.4° over 4.5s),
 * crossfading pose swaps, press squash (0.98) and tap-to-advance-pose with
 * a haptic tick. Everything is gated on reduced motion.
 */
@Composable
fun AkinStage(
    modifier: Modifier = Modifier,
    size: Dp = 220.dp,
    initialPose: AkinPose = AkinPose.Idle,
    onPoseChange: ((AkinPose) -> Unit)? = null,
) {
    val reducedMotion = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    var pose by remember { mutableStateOf(initialPose) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    val bobTransition = rememberInfiniteTransition(label = "akinBob")
    val bobPhase by bobTransition.animateFloat(
        initialValue = -1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4500, easing = AzfMotion.RevealEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "akinBobPhase",
    )
    val squash by animateFloatAsState(
        targetValue = if (pressed && !reducedMotion) 0.98f else 1f,
        label = "akinSquash",
    )

    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer {
                if (!reducedMotion) {
                    translationY = bobPhase * 10.dp.toPx()
                    rotationZ = bobPhase * 0.4f
                }
                scaleX = squash
                scaleY = squash
            }
            .clip(AzfShapes.Card)
            .clickable(interactionSource = interaction, indication = null) {
                haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                pose = when (pose) {
                    AkinPose.Idle -> AkinPose.Guard
                    AkinPose.Guard -> AkinPose.Lift
                    AkinPose.Lift -> AkinPose.Idle
                }
                onPoseChange?.invoke(pose)
            },
    ) {
        AnimatedContent(
            targetState = pose,
            transitionSpec = {
                if (reducedMotion) {
                    fadeIn(tween(0)) togetherWith fadeOut(tween(0))
                } else {
                    fadeIn(tween(300)) togetherWith fadeOut(tween(300))
                }
            },
            label = "akinPose",
        ) { current ->
            AssetImage(
                assetPath = current.assetPath,
                contentDescription = null,
                modifier = Modifier.size(size),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AkinStagePreview() {
    AzfTheme {
        AkinStage()
    }
}
