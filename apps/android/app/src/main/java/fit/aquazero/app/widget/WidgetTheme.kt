package fit.aquazero.app.widget

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.text.FontWeight
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing

/**
 * The Deep Sea palette and rhythm, restated in the types Glance understands.
 *
 * Glance renders through RemoteViews, so none of `core/designsystem` — not
 * `AzfTheme`, not `AzfCard`, not a single composable — can be reused here.
 * What *can* be reused is the values: [AzfColors] holds plain
 * `androidx.compose.ui.graphics.Color`s and [AzfSpacing] plain `Dp`s, both of
 * which Glance accepts. So this file is a re-wrapping and contains no colour
 * of its own; change DESIGN.md's palette and the widget follows.
 *
 * Every colour is fixed rather than resolved per light/dark. The app is
 * dark-only (`MainActivity` forces dark system bars, `AzfTheme` exposes one
 * scheme), and a widget that brightened on a light-themed launcher would be
 * the only surface of this product that ever did.
 */
internal object WidgetTheme {

    /** The card the whole widget sits on — one step up from the app background. */
    val Card = ColorProvider(AzfColors.SurfaceContainer)

    /** Primary body text. */
    val OnCard = ColorProvider(AzfColors.OnSurface)

    /** Secondary text: units, labels, the not-yet states. */
    val Muted = ColorProvider(AzfColors.OnSurfaceVariant)

    /** Calorie progress fill. */
    val Accent = ColorProvider(AzfColors.Primary)

    /** Unfilled progress track (DESIGN.md's ring track). */
    val Track = ColorProvider(AzfColors.RingTrack)

    /** The hydration button's fill and its label. */
    val ActionFill = ColorProvider(AzfColors.PrimaryContainer)
    val OnActionFill = ColorProvider(AzfColors.OnPrimaryContainer)

    /** A completed workout, in the palette's one "good news" colour. */
    val Positive = ColorProvider(AzfColors.Secondary)

    // ----- text -----

    /** The kcal headline: the one number the widget exists to show. */
    val Headline = TextStyle(color = OnCard, fontSize = 15.sp, fontWeight = FontWeight.Bold)

    /** Hydration total — a step quieter than the headline. */
    val Body = TextStyle(color = OnCard, fontSize = 14.sp, fontWeight = FontWeight.Bold)

    /** Status lines and the setup prompt. */
    val Caption = TextStyle(color = Muted, fontSize = 12.sp)

    /** Workout status when today's session is done. */
    val CaptionPositive = TextStyle(color = Positive, fontSize = 12.sp, fontWeight = FontWeight.Medium)

    /** The hydration button label. */
    val ActionLabel = TextStyle(
        color = OnActionFill,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
    )

    // ----- metrics -----

    /**
     * Padding inside the widget card.
     *
     * `AzfSpacing.CardPadding` is 20dp, which is right for a phone screen and
     * wrong here: a two-cell-tall widget has roughly 110dp to work with, and
     * 40dp of it cannot go to margins. The next value down the same scale is
     * used instead so the rhythm still comes from one place.
     */
    val CardPadding: Dp = AzfSpacing.ElementGapSmall

    /** Gap between the widget's three bands. */
    val BandGap: Dp = AzfSpacing.ElementGapSmall

    /** Minimum tap area for the hydration button (DESIGN.md's touch target). */
    val TouchTarget: Dp = AzfSpacing.TouchTarget

    /** Card corner. Mirrors `AzfShapes.Card`, which is a Compose shape Glance cannot take. */
    val CardCorner: Dp = 20.dp

    /** Height of the calorie progress bar. */
    val ProgressHeight: Dp = 6.dp

    /** Horizontal padding inside the hydration button. */
    val ActionPadding: Dp = 14.dp
}
