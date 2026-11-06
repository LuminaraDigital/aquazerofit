package fit.aquazero.app.core.designsystem

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A 4dp grid (docs/design.md): 20dp container margin, 16dp card padding,
 * 12dp between cards, 32dp between sections.
 */
object AzfSpacing {
    /** Side margin of the primary content container. */
    val ContainerMargin: Dp = 20.dp

    /** Consistent padding for screen containers. */
    val ContainerPadding: Dp = 20.dp

    /** Gap between cards within a section. */
    val Gutter: Dp = 12.dp

    /** Padding inside cards. */
    val CardPadding: Dp = 16.dp

    /** Vertical gap between major sections. */
    val SectionGap: Dp = 32.dp

    /** Small element gap. */
    val ElementGapSmall: Dp = 8.dp

    /** Medium element gap. */
    val ElementGapMedium: Dp = 16.dp

    /** Minimum touch target for interactive elements. */
    val TouchTarget: Dp = 48.dp
}
