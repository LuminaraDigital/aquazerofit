package fit.aquazero.app.feature.progress

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingFlat
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.network.dto.AchievementStatusDto
import fit.aquazero.app.core.network.dto.ConsistencyStatusDto
import fit.aquazero.app.core.network.dto.ProgressInsightDto

/** Compact cumulative metric tile. Nothing here can be reset by a missed day. */
@Composable
fun MetricCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    unit: String? = null,
    icon: ImageVector? = null,
    accent: Color = Color.Unspecified,
) {
    val tint = if (accent == Color.Unspecified) {
        LocalAzfExtended.current.primaryFixedDim
    } else {
        accent
    }
    AzfCard(tier = AzfCardTier.Compact, modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier
                        .size(16.dp)
                        .padding(end = 2.dp),
                )
            }
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = if (icon != null) 6.dp else 0.dp),
            )
        }
        Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 4.dp)) {
            Text(
                text = value,
                style = DataLarge.copy(fontSize = 26.sp, lineHeight = 28.sp),
                color = tint,
            )
            if (unit != null) {
                Text(
                    text = unit,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                )
            }
        }
    }
}

/**
 * Consistency — the replacement for the punishing streak counter.
 *
 * The hero number is `activeDays of windowDays`, which only ever grows with
 * effort and cannot be reset to zero by a missed day. The current run is
 * supporting text, the all-time best stays visible, and nothing on this
 * surface renders a missed day: absent, not struck through, not counted
 * against the user. There is no "broken" state to render.
 */
@Composable
fun ConsistencyCard(
    consistency: ConsistencyStatusDto,
    modifier: Modifier = Modifier,
) {
    val accent = LocalAzfExtended.current.primaryFixedDim
    val runDays = ConsistencyCopy.currentRunDays(consistency)
    val bestDays = ConsistencyCopy.bestDays(consistency)
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.consistency_title).uppercase(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.consistency_window, consistency.windowDays),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = stringResource(ConsistencyCopy.stateLabel(consistency.state)),
                style = MaterialTheme.typography.labelMedium,
                color = accent,
                modifier = Modifier
                    .clip(AzfShapes.Pill)
                    .background(accent.copy(alpha = 0.12f))
                    .border(BorderStroke(1.dp, accent.copy(alpha = 0.4f)), AzfShapes.Pill)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }

        if (ConsistencyCopy.hasActivity(consistency)) {
            Row(
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
                verticalAlignment = Alignment.Bottom,
            ) {
                Text(
                    text = consistency.activeDays.toString(),
                    style = DataLarge.copy(fontSize = 36.sp, lineHeight = 38.sp),
                    color = accent,
                )
                Text(
                    text = stringResource(
                        R.string.consistency_of_last,
                        consistency.windowDays,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 8.dp, bottom = 3.dp),
                )
            }
        } else {
            Text(
                text = stringResource(R.string.consistency_empty_headline),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
        }

        // Proportion only — the meter never marks an individual day as missed.
        Box(
            modifier = Modifier
                .padding(top = 12.dp)
                .fillMaxWidth()
                .height(8.dp)
                .clip(AzfShapes.Pill)
                .background(LocalAzfExtended.current.ringTrack),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(ConsistencyCopy.fraction(consistency))
                    .height(8.dp)
                    .clip(AzfShapes.Pill)
                    .background(accent),
            )
        }

        Text(
            text = stringResource(ConsistencyCopy.body(consistency)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )

        if (runDays != null || bestDays != null) {
            Row(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                if (runDays != null) {
                    Text(
                        text = stringResource(
                            R.string.consistency_current_run,
                            pluralStringResource(R.plurals.days_count, runDays, runDays),
                        ),
                        style = DataSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (bestDays != null) {
                    Text(
                        text = stringResource(
                            R.string.consistency_best,
                            pluralStringResource(R.plurals.days_count, bestDays, bestDays),
                        ),
                        style = DataSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/**
 * Weekly insight. The endpoint always answers 200 for an authenticated user —
 * new user, free tier, consent off, guardrail, AI outage — so there is no
 * error treatment: the deterministic narrative renders exactly as calmly as a
 * model-authored one, and the "why" is a quiet footnote, never a gate.
 *
 * Direction is not valence: up and down arrows share one neutral ink, because
 * colouring a weight increase as bad is the shame mechanic this surface exists
 * to remove. Direction is also spoken, never left to the glyph.
 */
@Composable
fun WeeklyInsightCard(
    insight: ProgressInsightDto,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text = stringResource(R.string.progress_insight_title).uppercase(),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.progress_insight_period, insight.periodDays),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = insight.narrative,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 12.dp),
        )

        if (insight.changes.isNotEmpty()) {
            Text(
                text = stringResource(R.string.progress_insight_changes).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
            insight.changes.forEach { change ->
                val spokenDirection = stringResource(directionWordRes(change.direction))
                Row(
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .semantics { contentDescription = "$spokenDirection ${change.label}" },
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = directionIcon(change.direction),
                            contentDescription = null,
                            // Same ink for every direction — an arrow reports,
                            // it does not judge.
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                    Text(
                        text = change.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
            }
        }

        fallbackNoteRes(insight.ai?.model)?.let { noteRes ->
            HorizontalDivider(
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
            )
            Text(
                text = stringResource(noteRes),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
}

/** One achievement badge. Locked badges are quiet, never scolding. */
@Composable
fun AchievementTile(
    status: AchievementStatusDto,
    earnedDateLabel: String?,
    modifier: Modifier = Modifier,
) {
    val earned = status.earnedAt != null
    val description = if (earned) {
        stringResource(
            R.string.progress_badge_earned,
            status.definition.name,
            earnedDateLabel.orEmpty(),
        )
    } else {
        stringResource(R.string.progress_badge_locked, status.definition.name)
    }
    Column(
        modifier = modifier.semantics { contentDescription = description },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .then(
                    if (earned) {
                        Modifier.background(LocalAzfExtended.current.ctaGradient)
                    } else {
                        Modifier
                            .background(MaterialTheme.colorScheme.surfaceContainerLowest)
                            .border(
                                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                CircleShape,
                            )
                            .alpha(0.5f)
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (earned) Icons.Outlined.EmojiEvents else Icons.Outlined.Lock,
                contentDescription = null,
                tint = if (earned) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = status.definition.name,
            style = MaterialTheme.typography.labelSmall,
            color = if (earned) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        if (earned && earnedDateLabel != null) {
            Text(
                text = earnedDateLabel,
                style = DataSmall.copy(fontSize = 10.sp, lineHeight = 12.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun directionIcon(direction: String): ImageVector = when (direction) {
    "up" -> Icons.Outlined.ArrowUpward
    "down" -> Icons.Outlined.ArrowDownward
    else -> Icons.AutoMirrored.Outlined.TrendingFlat
}

private fun directionWordRes(direction: String): Int = when (direction) {
    "up" -> R.string.progress_insight_up
    "down" -> R.string.progress_insight_down
    else -> R.string.progress_insight_steady
}

/**
 * Why a deterministic narrative was served, where the user could act on it.
 * `insufficient-data` deliberately has no footnote: the narrative already
 * says "keep logging", and a second nudge on an empty week is nagging.
 */
private fun fallbackNoteRes(model: String?): Int? = when (model) {
    "premium-required-fallback" -> R.string.progress_insight_premium_note
    "consent-off-fallback" -> R.string.progress_insight_consent_note
    else -> null
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun ConsistencyCardPreview() {
    AzfTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            ConsistencyCard(
                consistency = ConsistencyStatusDto(
                    currentDays = 4,
                    bestDays = 11,
                    activeDays = 18,
                    windowDays = 28,
                    graceRemaining = 1,
                ),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MetricCardPreview() {
    AzfTheme {
        Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricCard(label = "Workouts", value = "42", modifier = Modifier.weight(1f))
            MetricCard(
                label = "Burned",
                value = "18,420",
                unit = "kcal",
                modifier = Modifier.weight(1f),
            )
        }
    }
}
