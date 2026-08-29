package fit.aquazero.app.feature.gamification

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LevelBar
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.model.CoachRankDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.model.XpBreakdownEntryDto

/**
 * Level, rank and what today has banked.
 *
 * Every phrase here is chosen against the same rule: **nothing on this surface
 * describes a shortfall.** It reads "1,240 XP banked toward level 8", never
 * "410 to go"; the daily ceiling reads "full day banked", never "limit
 * reached"; and there is no countdown, because a level is never lost and
 * there is nothing to count down to. A progress bar in a product that also
 * holds someone's weight is a pressure surface by default, and this one is
 * deliberately defused.
 *
 * The breakdown renders only when there is something in it. An itemised list
 * of zeroes on a rest morning is a scorecard of nothing done, which is the
 * exact opposite of what the feature is for.
 */
@Composable
fun XpPanel(
    experience: ExperienceStatusDto,
    modifier: Modifier = Modifier,
    showBreakdown: Boolean = true,
) {
    val progressCd = progressDescription(experience)
    Column(modifier = modifier.fillMaxWidth()) {
        LevelBar(
            level = experience.level,
            rankName = experience.rank.name,
            levelProgress = experience.levelProgress.toFloat(),
            earnedToday = experience.earnedToday,
        )
        Text(
            text = bankedLine(experience),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = 8.dp)
                .semantics { contentDescription = progressCd },
        )
        if (showBreakdown) {
            XpBreakdown(
                entries = experience.todayBreakdown,
                dailyCapReached = experience.dailyCapReached,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
}

@Composable
private fun bankedLine(experience: ExperienceStatusDto): String {
    val nextLevel = experience.nextLevelXp
    return if (nextLevel == null) {
        stringResource(R.string.xp_top_of_ladder, experience.totalXp.grouped())
    } else {
        stringResource(
            R.string.xp_banked_progress,
            experience.bankedIntoLevel.grouped(),
            experience.level + 1,
        )
    }
}

@Composable
private fun progressDescription(experience: ExperienceStatusDto): String {
    val percent = (experience.levelProgress * 100).toInt().coerceIn(0, 100)
    return stringResource(
        R.string.xp_progress_cd,
        experience.level,
        percent,
        experience.level + 1,
    )
}

/** Today's earnings, itemised. Renders nothing when there is nothing to say. */
@Composable
fun XpBreakdown(
    entries: List<XpBreakdownEntryDto>,
    dailyCapReached: Boolean,
    modifier: Modifier = Modifier,
) {
    if (entries.isEmpty()) return
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.xp_breakdown_title).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            entries.forEach { entry -> XpPill(entry) }
            if (dailyCapReached) BankedPill()
        }
    }
}

@Composable
private fun XpPill(entry: XpBreakdownEntryDto) {
    val accent = LocalAzfExtended.current.secondaryFixedDim
    val description = stringResource(R.string.xp_entry_cd, entry.label, entry.points)
    Row(
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(horizontal = 10.dp, vertical = 5.dp)
            .semantics { contentDescription = description },
    ) {
        Text(
            text = entry.label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "+${entry.points}",
            style = DataSmall,
            color = accent,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

@Composable
private fun BankedPill() {
    val accent = LocalAzfExtended.current.primaryFixedDim
    Text(
        text = stringResource(R.string.xp_full_day_banked),
        style = MaterialTheme.typography.labelMedium,
        color = accent,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(accent.copy(alpha = 0.12f))
            .border(BorderStroke(1.dp, accent.copy(alpha = 0.4f)), AzfShapes.Pill)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

/** Thousands separator without dragging in a locale-formatting dependency. */
fun Int.grouped(): String = toString()
    .reversed()
    .chunked(3)
    .joinToString(",")
    .reversed()

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun XpPanelPreview() {
    AzfTheme {
        XpPanel(
            experience = ExperienceStatusDto(
                totalXp = 1_240,
                level = 6,
                rank = CoachRankDto(id = "prospect", name = "Prospect", minLevel = 5),
                levelStartXp = 1_125,
                nextLevelXp = 1_575,
                levelProgress = 0.26,
                earnedToday = 85,
                todayBreakdown = listOf(
                    XpBreakdownEntryDto("activeDay", "Showed up", 20),
                    XpBreakdownEntryDto("mealLog", "Meals logged", 30),
                    XpBreakdownEntryDto("workout", "Training", 30),
                    XpBreakdownEntryDto("waterLog", "Hydration logged", 5),
                ),
            ),
            modifier = Modifier.padding(20.dp),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun XpPanelCappedPreview() {
    AzfTheme {
        XpPanel(
            experience = ExperienceStatusDto(
                totalXp = 4_000,
                level = 11,
                rank = CoachRankDto(id = "top-eight", name = "Top Eight", minLevel = 11),
                levelStartXp = 4_125,
                nextLevelXp = 4_950,
                levelProgress = 0.9,
                earnedToday = 150,
                todayBreakdown = listOf(
                    XpBreakdownEntryDto("activeDay", "Showed up", 20),
                    XpBreakdownEntryDto("workout", "Training", 60),
                    XpBreakdownEntryDto("mealLog", "Meals logged", 40),
                    XpBreakdownEntryDto("weighIn", "Weigh-in", 15),
                    XpBreakdownEntryDto("recoveryDay", "Recovery honoured", 15),
                ),
                dailyCapReached = true,
            ),
            modifier = Modifier.padding(20.dp),
        )
    }
}
