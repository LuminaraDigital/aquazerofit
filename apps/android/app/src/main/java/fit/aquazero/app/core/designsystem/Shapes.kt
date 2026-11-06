package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Two radii and a pill (docs/design.md). Corners nest concentrically: a tile
 * inset 8dp inside a [Card] takes [Inner].
 */
object AzfShapes {
    /** Containers: cards, sheets, the bottom dock, the coach composer. */
    val Card = RoundedCornerShape(16.dp)

    /** Controls: buttons, inputs, inner tiles, thumbnails. */
    val Inner = RoundedCornerShape(8.dp)

    /** Fully rounded pill (chips, avatars, the log button, progress tracks). */
    val Pill = RoundedCornerShape(percent = 50)
}

/** Material shape scheme mapped onto the same two radii. */
val AzfMaterialShapes: Shapes = Shapes(
    extraSmall = AzfShapes.Inner,
    small = AzfShapes.Inner,
    medium = AzfShapes.Inner,
    large = AzfShapes.Card,
    extraLarge = AzfShapes.Card,
)
