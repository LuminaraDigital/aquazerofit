package fit.aquazero.app.core.designsystem

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing rhythm from DESIGN.md: 20dp container margin and card padding,
 * 16dp gutter, 32dp between major sections.
 */
object AzfSpacing {
    /** Side margin of the primary content container. */
    val ContainerMargin: Dp = 20.dp

    /** Gap between cards within a section. */
    val Gutter: Dp = 16.dp

    /** Padding inside cards. */
    val CardPadding: Dp = 20.dp

    /** Vertical gap between major sections. */
    val SectionGap: Dp = 32.dp

    /** Small element gap. */
    val ElementGapSmall: Dp = 8.dp

    /** Medium element gap. */
    val ElementGapMedium: Dp = 16.dp

    /** Minimum touch target for interactive elements. */
    val TouchTarget: Dp = 48.dp
}
