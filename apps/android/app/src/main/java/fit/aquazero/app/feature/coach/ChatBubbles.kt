package fit.aquazero.app.feature.coach

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.model.ChatToolCallDto
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachPersona
import fit.aquazero.app.core.ui.CoachRoster

/** Bubble corner radii: the tail corner is tight, the rest are card-round. */
private val UserBubbleShape = RoundedCornerShape(20.dp, 20.dp, 6.dp, 20.dp)
private val AssistantBubbleShape = RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)

/**
 * Compiled once, not once per recomposition.
 *
 * The lower/upper seam inside a camel-case tool name. `humaniseTool` is reached
 * from the composable `toolLabel`, so a `Regex(...)` built inside it recompiled
 * the pattern every time a tool card recomposed — which, mid-stream, is every
 * token. Same reasoning as the patterns in `ChatActionModel.kt`.
 */
private val CAMEL_BOUNDARY = Regex("([a-z])([A-Z])")

/** The user's own turn: gradient fill, right-aligned, no affordances. */
@Composable
fun UserBubble(
    content: String,
    modifier: Modifier = Modifier,
    timestamp: String? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.End,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .clip(UserBubbleShape)
                .background(LocalAzfExtended.current.ctaGradient)
                .padding(14.dp),
        ) {
            Text(
                text = content,
                style = MaterialTheme.typography.bodyMedium,
                color = AzfColors.OnPrimary,
            )
        }
        if (timestamp != null) {
            Text(
                text = timestamp,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, end = 8.dp),
            )
        }
    }
}

/**
 * An assistant turn.
 *
 * Long-press opens the report menu. Reporting AI-generated content is a Google
 * Play requirement for apps that surface it, not a nicety, so the affordance
 * is on every assistant bubble rather than hidden behind a settings screen —
 * and it is a long-press rather than a visible button because a flag icon on
 * every reply reads as an invitation to distrust the coach.
 *
 * [guardrailBlocked] switches the bubble to the [SafetyFrame] treatment.
 */
@Composable
fun AssistantBubble(
    content: String,
    persona: CoachPersona,
    modifier: Modifier = Modifier,
    guardrailBlocked: Boolean = false,
    reported: Boolean = false,
    toolCalls: List<ChatToolCallDto> = emptyList(),
    timestamp: String? = null,
    actions: List<ChatAction> = emptyList(),
    isSpeaking: Boolean = false,
    onSpeakClick: (() -> Unit)? = null,
    onActionClick: ((ChatAction) -> Unit)? = null,
    onReport: (() -> Unit)? = null,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val reportHint = stringResource(R.string.coach_report_hint)

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.Start,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(0.92f),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoachByline(persona)
            if (onSpeakClick != null && !guardrailBlocked) {
                IconButton(
                    onClick = onSpeakClick,
                    modifier = Modifier.size(28.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.VolumeUp,
                        contentDescription = if (isSpeaking) "Stop voice" else "Read aloud",
                        tint = if (isSpeaking) persona.colour else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Box(modifier = Modifier.fillMaxWidth(0.92f)) {
            val bubble = Modifier
                .fillMaxWidth()
                .clip(AssistantBubbleShape)
                .then(
                    if (onReport != null) {
                        Modifier.combinedClickable(
                            interactionSource = interaction,
                            indication = null,
                            onClick = {},
                            onLongClick = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                menuOpen = true
                            },
                            onLongClickLabel = reportHint,
                        )
                    } else {
                        Modifier
                    },
                )

            if (guardrailBlocked) {
                SafetyFrame(content = content, modifier = bubble)
            } else {
                Column(
                    modifier = bubble
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .border(
                            BorderStroke(
                                1.dp,
                                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
                            ),
                            AssistantBubbleShape,
                        )
                        .padding(14.dp),
                ) {
                    MiniMarkdownText(text = content)
                    if (toolCalls.isNotEmpty()) {
                        ToolCards(
                            toolCalls = toolCalls,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                    }
                    if (actions.isNotEmpty() && onActionClick != null) {
                        ActionChipGroup(
                            actions = actions,
                            onActionClick = onActionClick,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
            }

            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.coach_report)) },
                    leadingIcon = {
                        Icon(imageVector = Icons.Outlined.Flag, contentDescription = null)
                    },
                    onClick = {
                        menuOpen = false
                        onReport?.invoke()
                    },
                )
            }
        }
        Row(
            modifier = Modifier.padding(top = 4.dp, start = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (reported) {
                Text(
                    text = stringResource(R.string.coach_reported_badge),
                    style = MaterialTheme.typography.labelSmall,
                    color = LocalAzfExtended.current.coral,
                    modifier = Modifier.padding(end = 8.dp),
                )
            }
            if (timestamp != null) {
                Text(
                    text = timestamp,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * 1-Tap interactive action chips embedded within a coach response.
 */
@Composable
fun ActionChipGroup(
    actions: List<ChatAction>,
    onActionClick: (ChatAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    var executedActionIds by remember { mutableStateOf(setOf<String>()) }

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        actions.forEach { action ->
            val executed = action.id in executedActionIds
            val bg = if (executed) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerHighest
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(bg)
                    .border(
                        BorderStroke(
                            1.dp,
                            if (executed) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outlineVariant
                            },
                        ),
                        RoundedCornerShape(12.dp),
                    )
                    .clickable(enabled = !executed) {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        executedActionIds = executedActionIds + action.id
                        onActionClick(action)
                    }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = when {
                        executed -> Icons.Outlined.Check
                        action is ChatAction.LogWater -> Icons.Outlined.WaterDrop
                        else -> Icons.Outlined.Restaurant
                    },
                    contentDescription = null,
                    tint = if (executed) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (executed) "Logged" else action.label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (executed) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                )
            }
        }
    }
}

/**
 * The guardrail treatment: **calm green, never alarm red.**
 *
 * A refusal here is usually the app declining to give medical advice, or
 * responding to something painful a user typed. Painting that in error red
 * tells the person their question was wrong; the `spa` mark and the secondary
 * green say the coach is stepping back, kindly. The crisis signpost arrives
 * inside [content], already localised by the server from `Accept-Language` —
 * this composable renders what it is given and never composes its own.
 */
@Composable
fun SafetyFrame(
    content: String,
    modifier: Modifier = Modifier,
) {
    val calm = MaterialTheme.colorScheme.secondary
    val description = stringResource(R.string.coach_safety_cd)
    Row(
        modifier = modifier
            .background(calm.copy(alpha = 0.10f))
            .border(BorderStroke(1.dp, calm.copy(alpha = 0.4f)), AssistantBubbleShape)
            .padding(14.dp)
            .semantics { contentDescription = description },
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = Icons.Outlined.Spa,
            contentDescription = null,
            tint = calm,
            modifier = Modifier
                .size(20.dp)
                .padding(end = 2.dp),
        )
        Spacer(Modifier.width(10.dp))
        MiniMarkdownText(text = content, modifier = Modifier.fillMaxWidth())
    }
}

/** Who is answering. */
@Composable
fun CoachByline(persona: CoachPersona, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        CoachAvatar(persona = persona, size = 28.dp, contentDescription = null)
        Text(
            text = persona.firstName,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/**
 * Three dots that breathe while the first token is still in flight. Under
 * reduced motion they hold still — the label carries the meaning either way.
 */
@Composable
fun TypingDots(
    label: String,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val accent = LocalAzfExtended.current.primaryFixedDim
    val transition = rememberInfiniteTransition(label = "typing")
    Row(
        modifier = modifier.semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        repeat(3) { index ->
            val alpha by transition.animateFloat(
                initialValue = 0.35f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = 620,
                        delayMillis = index * 200,
                        easing = LinearEasing,
                    ),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "typingDot$index",
            )
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .graphicsLayer { this.alpha = if (reducedMotion) 0.8f else alpha }
                    .clip(AzfShapes.Pill)
                    .background(accent),
            )
        }
    }
}

/** Grounding the coach used, summarised. Never the raw tool payload. */
@Composable
fun ToolCards(
    toolCalls: List<ChatToolCallDto>,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        toolCalls.forEach { call ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(AzfShapes.Inner)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .padding(12.dp),
            ) {
                Text(
                    text = toolLabel(call.tool).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = LocalAzfExtended.current.primaryFixedDim,
                )
                Text(
                    text = call.resultSummary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

/**
 * Map a tool name to a heading, falling back to a humanised form of the name
 * itself (`getFooBar` → "Foo bar") so a tool added server-side still renders
 * legibly instead of leaking a camel-case identifier.
 */
@Composable
private fun toolLabel(tool: String): String = when (tool) {
    "getTodayNutrition" -> stringResource(R.string.coach_tool_nutrition)
    "getTodayWorkout" -> stringResource(R.string.coach_tool_workout)
    "getCurrentPlan" -> stringResource(R.string.coach_tool_plan)
    "getProgressSummary" -> stringResource(R.string.coach_tool_progress)
    else -> humaniseTool(tool)
}

internal fun humaniseTool(tool: String): String {
    val words = tool
        .removePrefix("get")
        .replace(CAMEL_BOUNDARY, "$1 $2")
        .lowercase()
        .trim()
    return words.replaceFirstChar { it.uppercase() }
}

/** The persistent wellness disclaimer. Never dismissible, never collapsed. */
@Composable
fun WellnessDisclaimerBar(modifier: Modifier = Modifier) {
    val description = stringResource(R.string.coach_disclaimer_cd)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                AzfShapes.Inner,
            )
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .semantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.Info,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.tertiaryContainer,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(R.string.coach_disclaimer),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 10.dp),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400)
@Composable
private fun ChatBubblesPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            WellnessDisclaimerBar()
            UserBubble(content = "What should I eat tonight?", timestamp = "18:42")
            AssistantBubble(
                content = "You have banked **1,480 kcal** so far.\n\n- a palm of protein\n- something green",
                persona = CoachRoster.default(),
                timestamp = "18:42",
                toolCalls = listOf(
                    ChatToolCallDto(
                        tool = "getTodayNutrition",
                        resultSummary = "1,480 kcal · 96 g protein logged today",
                    ),
                ),
                onReport = {},
            )
            AssistantBubble(
                content = "I can't help with medication questions, but a pharmacist or your GP can.",
                persona = CoachRoster.default(),
                guardrailBlocked = true,
                reported = true,
                timestamp = "18:44",
                onReport = {},
            )
            TypingDots(label = "Akin is typing")
        }
    }
}
