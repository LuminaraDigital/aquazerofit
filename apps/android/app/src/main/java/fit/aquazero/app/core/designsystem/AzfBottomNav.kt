package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.SportsMartialArts
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R

/** The five root tabs (mirrors the web's BottomNav). */
enum class AzfTab(val labelRes: Int, val icon: ImageVector) {
    Home(R.string.tab_home, Icons.Outlined.Home),
    Nutrition(R.string.tab_nutrition, Icons.Outlined.Restaurant),
    Workouts(R.string.tab_workouts, Icons.Outlined.FitnessCenter),
    Progress(R.string.tab_progress, Icons.Outlined.Insights),
    Coach(R.string.tab_coach, Icons.Outlined.SportsMartialArts),
}

/**
 * Fixed bottom bar: 5 items, glow-pill active indicator, haptic tick on tab
 * change. Sits on a translucent high surface with a hairline top divider.
 */
@Composable
fun AzfBottomNav(
    selected: AzfTab,
    onSelect: (AzfTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerLow.copy(alpha = 0.96f)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(vertical = 6.dp),
        ) {
            AzfTab.entries.forEach { tab ->
                val active = tab == selected
                val interaction = remember { MutableInteractionSource() }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(
                            interactionSource = interaction,
                            indication = null,
                            role = Role.Tab,
                        ) {
                            if (!active) {
                                haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                                onSelect(tab)
                            }
                        },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(AzfShapes.Pill)
                            .background(
                                if (active) {
                                    LocalAzfExtended.current.primaryFixedDim.copy(alpha = 0.16f)
                                } else {
                                    MaterialTheme.colorScheme.surfaceContainerLow.copy(alpha = 0f)
                                },
                            )
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                    ) {
                        Icon(
                            imageVector = tab.icon,
                            contentDescription = stringResource(tab.labelRes),
                            tint = if (active) {
                                LocalAzfExtended.current.primaryFixedDim
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.size(24.dp),
                        )
                    }
                    Text(
                        text = stringResource(tab.labelRes),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (active) {
                            LocalAzfExtended.current.primaryFixedDim
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                    if (active) {
                        Box(
                            modifier = Modifier
                                .padding(top = 2.dp)
                                .width(16.dp)
                                .height(3.dp)
                                .clip(AzfShapes.Pill)
                                .background(LocalAzfExtended.current.ctaGradient),
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfBottomNavPreview() {
    AzfTheme {
        AzfBottomNav(selected = AzfTab.Home, onSelect = {})
    }
}
