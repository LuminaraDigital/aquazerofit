package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * "Liquid Geometric" shape language: 20dp cards, 16dp inner elements, full
 * pills for chips and buttons.
 */
object AzfShapes {
    /** Card corner radius. */
    val Card = RoundedCornerShape(20.dp)

    /** Inner element radius (inputs, nested tiles). */
    val Inner = RoundedCornerShape(16.dp)

    /** Fully rounded pill (chips, buttons, indicators). */
    val Pill = RoundedCornerShape(percent = 50)

    /** The lit hero surface: larger than a card so it reads as the lead. */
    val Hero = RoundedCornerShape(28.dp)

    /** The coach composer. */
    val Composer = RoundedCornerShape(24.dp)

    /** The floating bottom dock. */
    val Dock = RoundedCornerShape(30.dp)
}

/** Material shape scheme mapped onto the Deep Sea shape language. */
val AzfMaterialShapes: Shapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = AzfShapes.Inner,
    large = AzfShapes.Card,
    extraLarge = RoundedCornerShape(28.dp),
)
