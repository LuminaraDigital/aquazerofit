// Design tokens are PascalCase throughout this package, matching the Compose
// convention these values are read alongside (`MaterialTheme.colorScheme...`).
// Screaming-snake for the handful that happen to be `const` would make the
// token list inconsistent with itself.
@file:Suppress("ktlint:standard:property-naming")

package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.GraphicsLayerScope
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.node.CompositionLocalConsumerModifierNode
import androidx.compose.ui.node.LayoutModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.currentValueOf
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

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
 *
 * The value itself is read once per [AzfTheme] and published through
 * [LocalAzfReducedMotion]; this is only the accessor. It used to call
 * `Settings.Global.getFloat` behind a keyless `remember`, which caches per
 * *call site*, not per app — a loading dashboard paid a dozen binder round
 * trips to the settings provider on the main thread, and a scrolling chip row
 * paid one per item.
 */
@Composable
fun rememberReducedMotion(): Boolean = LocalAzfReducedMotion.current

/**
 * Entrance reveal: fade in + 16dp rise over 600ms with the signature easing,
 * staggered by [index] * 80ms. No-ops entirely under reduced motion.
 *
 * Implemented as a [Modifier.Node] rather than `Modifier.composed`. `composed`
 * produces a fresh, non-equal Modifier instance on every recomposition, so
 * every composable it was applied to failed its modifier equality check and
 * could never skip — with or without strong skipping.
 */
fun Modifier.revealOnEnter(index: Int = 0): Modifier = this then RevealOnEnterElement(index)

/**
 * Press feedback: scales the element to [AzfMotion.PressScale] while the
 * given [interactionSource] reports a press. Gated on reduced motion.
 *
 * See [revealOnEnter] for why this is a node and not a `composed` modifier.
 */
fun Modifier.pressScale(interactionSource: MutableInteractionSource): Modifier =
    this then PressScaleElement(interactionSource)

private class RevealOnEnterElement(val index: Int) : ModifierNodeElement<RevealOnEnterNode>() {

    override fun create(): RevealOnEnterNode = RevealOnEnterNode(index)

    override fun update(node: RevealOnEnterNode) {
        // Deliberately does not restart an in-flight reveal: the old
        // `LaunchedEffect(Unit)` captured the first index and ignored later
        // ones, and a card that re-staggers mid-entrance looks broken.
        node.index = index
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "revealOnEnter"
        properties["index"] = index
    }

    override fun equals(other: Any?): Boolean =
        this === other || (other is RevealOnEnterElement && other.index == index)

    override fun hashCode(): Int = index.hashCode()
}

/**
 * Drives the entrance reveal from one 0 → 1 progress value.
 *
 * One value is enough because both halves of the reveal share a spec: with
 * `tween(600, RevealEasing)`, `alpha` running 0 → 1 and `rise` running 1 → 0
 * are the same curve mirrored, so `rise == 1 - alpha` at every frame.
 * MotionModifierTest pins that. `progress` is read inside the layer block,
 * which Compose observes separately from composition — the animation costs a
 * repaint, never a recomposition or a relayout.
 */
private class RevealOnEnterNode(var index: Int) :
    Modifier.Node(),
    LayoutModifierNode,
    CompositionLocalConsumerModifierNode {

    private val progress = mutableFloatStateOf(0f)
    private var reducedMotion = false
    private var started = false

    private val layerBlock: GraphicsLayerScope.() -> Unit = {
        val revealed = progress.floatValue
        alpha = revealed
        translationY = (1f - revealed) * AzfMotion.RevealRise.toPx()
    }

    override fun onDetach() = rearm()

    // Lazy-list reuse deactivates a node rather than detaching it.
    override fun onReset() = rearm()

    override fun MeasureScope.measure(measurable: Measurable, constraints: Constraints): MeasureResult {
        if (!started) {
            started = true
            // First measure, not `onAttach`: measure is where a node is
            // documented to be able to read a composition local, and it lands
            // on the same frame the old `LaunchedEffect` would have run on.
            reducedMotion = currentValueOf(LocalAzfReducedMotion)
            if (!reducedMotion) startReveal()
        }
        val placeable = measurable.measure(constraints)
        return layout(placeable.width, placeable.height) {
            if (reducedMotion) {
                placeable.place(0, 0)
            } else {
                placeable.placeWithLayer(0, 0, layerBlock = layerBlock)
            }
        }
    }

    private fun startReveal() {
        val staggerMs = index * AzfMotion.RevealStaggerMs
        coroutineScope.launch {
            delay(staggerMs)
            animate(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = AzfMotion.revealSpec<Float>(),
            ) { value, _ -> progress.floatValue = value }
        }
    }

    /**
     * Back to hidden, synchronously. A node that goes away and comes back — a
     * recycled list row, a screen popped and pushed again — replays the reveal
     * from the start, exactly as the old `remember`-backed flag did when the
     * composable left composition.
     */
    private fun rearm() {
        started = false
        progress.floatValue = 0f
    }
}

private class PressScaleElement(val interactionSource: InteractionSource) :
    ModifierNodeElement<PressScaleNode>() {

    override fun create(): PressScaleNode = PressScaleNode(interactionSource)

    override fun update(node: PressScaleNode) {
        node.setInteractionSource(interactionSource)
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "pressScale"
        properties["interactionSource"] = interactionSource
    }

    override fun equals(other: Any?): Boolean =
        this === other || (other is PressScaleElement && other.interactionSource == interactionSource)

    override fun hashCode(): Int = interactionSource.hashCode()
}

/**
 * Press feedback as a node. `scale` is read inside the layer block, so a press
 * repaints without recomposing or relaying out anything.
 *
 * `Animatable(1f)` reproduces `animateFloatAsState`'s default exactly: the same
 * `spring()` with a 0.01 visibility threshold, and the same velocity-preserving
 * retarget when a press is released mid-animation.
 */
private class PressScaleNode(private var interactionSource: InteractionSource) :
    Modifier.Node(),
    LayoutModifierNode,
    CompositionLocalConsumerModifierNode {

    private val scale = Animatable(1f)
    private var reducedMotion = false
    private var started = false
    private var collectJob: Job? = null

    private val layerBlock: GraphicsLayerScope.() -> Unit = {
        val current = scale.value
        scaleX = current
        scaleY = current
    }

    fun setInteractionSource(source: InteractionSource) {
        if (source == interactionSource) return
        interactionSource = source
        collectJob?.cancel()
        collectJob = null
        if (started && !reducedMotion) collectPresses()
    }

    override fun onDetach() = rearm()

    // Lazy-list reuse deactivates a node rather than detaching it.
    override fun onReset() = rearm()

    override fun MeasureScope.measure(measurable: Measurable, constraints: Constraints): MeasureResult {
        if (!started) {
            started = true
            reducedMotion = currentValueOf(LocalAzfReducedMotion)
            if (!reducedMotion) collectPresses()
        }
        val placeable = measurable.measure(constraints)
        return layout(placeable.width, placeable.height) {
            if (reducedMotion) {
                placeable.place(0, 0)
            } else {
                placeable.placeWithLayer(0, 0, layerBlock = layerBlock)
            }
        }
    }

    /**
     * The node's own scope is cancelled for us on detach; drop the handle so
     * the next measure re-resolves reduced motion and re-subscribes.
     */
    private fun rearm() {
        collectJob = null
        started = false
    }

    private fun collectPresses() {
        val source = interactionSource
        collectJob = coroutineScope.launch {
            // A node cancelled mid-press comes back shrunk, and with nothing
            // pressed no interaction ever arrives to undo it.
            scale.snapTo(1f)
            val presses = mutableListOf<PressInteraction.Press>()
            source.interactions
                .map { interaction ->
                    when (interaction) {
                        is PressInteraction.Press -> presses.add(interaction)
                        is PressInteraction.Release -> presses.remove(interaction.press)
                        is PressInteraction.Cancel -> presses.remove(interaction.press)
                    }
                    if (presses.isEmpty()) 1f else AzfMotion.PressScale
                }
                .distinctUntilChanged()
                // `collectLatest` cancels the in-flight animateTo on the next
                // press change; Animatable then retargets from the current
                // value and velocity, which is what animateFloatAsState did.
                .collectLatest { target -> scale.animateTo(target) }
        }
    }
}
