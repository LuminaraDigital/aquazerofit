package fit.aquazero.app.core.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.SportsMartialArts
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.SportsMartialArts
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R

/**
 * The five root destinations. Progress is reached from Home rather than from
 * the dock, which keeps four thumb targets either side of the quick-log button;
 * it still lights Home while open, because that is where the user came from.
 */
enum class AzfTab(val labelRes: Int, val icon: ImageVector, val activeIcon: ImageVector) {
    Home(R.string.tab_home, Icons.Outlined.Home, Icons.Filled.Home),
    Nutrition(R.string.tab_nutrition, Icons.Outlined.Restaurant, Icons.Filled.Restaurant),
    Workouts(R.string.tab_workouts, Icons.Outlined.FitnessCenter, Icons.Filled.FitnessCenter),
    Progress(R.string.tab_progress, Icons.Outlined.Insights, Icons.Filled.Insights),
    Coach(R.string.tab_coach, Icons.Outlined.SportsMartialArts, Icons.Filled.SportsMartialArts),
}

private const val INACTIVE_ICON_SCALE = 1f
private const val ACTIVE_ICON_SCALE = 1.12f

/**
 * Floating dock: two tabs, the quick-log button, two tabs. Logging is what
 * this app is opened for most often, so it gets the middle of the thumb arc on
 * every root screen.
 */
@Composable
fun AzfBottomNav(
    selected: AzfTab,
    onSelect: (AzfTab) -> Unit,
    onQuickLog: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(68.dp)
                .clip(AzfShapes.Card)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f), AzfShapes.Card),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DockTab(AzfTab.Home, selected, onSelect)
            DockTab(AzfTab.Nutrition, selected, onSelect)
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                QuickLogButton(onClick = onQuickLog)
            }
            DockTab(AzfTab.Workouts, selected, onSelect)
            DockTab(AzfTab.Coach, selected, onSelect)
        }
    }
}

@Composable
private fun RowScope.DockTab(tab: AzfTab, selected: AzfTab, onSelect: (AzfTab) -> Unit) {
    val haptics = LocalHapticFeedback.current
    val reducedMotion = rememberReducedMotion()
    val interaction = remember { MutableInteractionSource() }
    val extended = LocalAzfExtended.current
    val lit = tab == selected || (selected == AzfTab.Progress && tab == AzfTab.Home)
    val tint by animateColorAsState(
        targetValue = if (lit) extended.primaryFixedDim else MaterialTheme.colorScheme.onSurfaceVariant,
        animationSpec = tween(if (reducedMotion) 0 else AzfMotion.ConfirmDurationMs),
        label = "dockTint",
    )
    val iconScale by animateFloatAsState(
        targetValue = if (lit) ACTIVE_ICON_SCALE else INACTIVE_ICON_SCALE,
        animationSpec = if (reducedMotion) tween(0) else spring(dampingRatio = 0.5f, stiffness = 500f),
        label = "dockIconScale",
    )
    Column(
        modifier = Modifier
            .weight(1f)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Tab,
            ) {
                if (tab != selected) {
                    haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                    onSelect(tab)
                }
            }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = if (lit) tab.activeIcon else tab.icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier
                .size(24.dp)
                .graphicsLayer {
                    scaleX = iconScale
                    scaleY = iconScale
                },
        )
        Text(
            text = stringResource(tab.labelRes),
            style = MaterialTheme.typography.labelMedium,
            color = tint,
            maxLines = 1,
        )
    }
}

@Composable
private fun QuickLogButton(onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val extended = LocalAzfExtended.current
    Box(
        modifier = Modifier
            .size(56.dp)
            .pressScale(interaction)
            .clip(CircleShape)
            .background(extended.primaryFixedDim)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClickLabel = stringResource(R.string.quick_log_open_cd),
            ) {
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Add,
            contentDescription = stringResource(R.string.quick_log_open_cd),
            tint = AzfColors.OnPrimaryFixed,
            modifier = Modifier.size(28.dp),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfBottomNavPreview() {
    AzfTheme {
        AzfBottomNav(selected = AzfTab.Home, onSelect = {}, onQuickLog = {})
    }
}
