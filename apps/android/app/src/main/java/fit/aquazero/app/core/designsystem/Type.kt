// Design tokens are PascalCase throughout this package, matching the Compose
// convention these values are read alongside (`MaterialTheme.colorScheme...`).
// Screaming-snake for the handful that happen to be `const` would make the
// token list inconsistent with itself.
@file:Suppress(
    "ktlint:standard:property-naming",
    // Same reason, detekt's equivalent rule.
    "TopLevelPropertyNaming",
)

package fit.aquazero.app.core.designsystem

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import fit.aquazero.app.R

/**
 * Corner Card type system (docs/design.md).
 *
 * Headings: Barlow Condensed SemiBold (uppercase is applied at call sites),
 * tracking +0.02–0.04em per DESIGN.md. Body & data: DM Sans (bundled as a
 * variable font; weights are selected via font-variation settings).
 *
 * Every numeric metric must use [TabularNumbers] (`tnum`) so live-updating
 * columns of digits do not jitter.
 */
val BarlowCondensed: FontFamily = FontFamily(
    Font(R.font.barlow_condensed_semibold, weight = FontWeight.SemiBold),
)

val DmSans: FontFamily = FontFamily(
    Font(
        R.font.dm_sans,
        weight = FontWeight.Normal,
        variationSettings = FontVariation.Settings(FontVariation.weight(400)),
    ),
    Font(
        R.font.dm_sans,
        weight = FontWeight.Medium,
        variationSettings = FontVariation.Settings(FontVariation.weight(500)),
    ),
    Font(
        R.font.dm_sans,
        weight = FontWeight.SemiBold,
        variationSettings = FontVariation.Settings(FontVariation.weight(600)),
    ),
    Font(
        R.font.dm_sans,
        weight = FontWeight.Bold,
        variationSettings = FontVariation.Settings(FontVariation.weight(700)),
    ),
)

/** `fontFeatureSettings` value for tabular figures on metric displays. */
const val TabularNumbers: String = "tnum"

/** DESIGN.md `data-lg`: 32sp/700 DM Sans with tabular figures. */
val DataLarge: TextStyle = TextStyle(
    fontFamily = DmSans,
    fontWeight = FontWeight.Bold,
    fontSize = 32.sp,
    lineHeight = 32.sp,
    fontFeatureSettings = TabularNumbers,
)

/** DESIGN.md `data-sm`: 14sp/700 DM Sans with tabular figures. */
val DataSmall: TextStyle = TextStyle(
    fontFamily = DmSans,
    fontWeight = FontWeight.Bold,
    fontSize = 14.sp,
    lineHeight = 14.sp,
    fontFeatureSettings = TabularNumbers,
)

/**
 * The signature numeral (docs/design.md): the one figure that answers a
 * screen's question, in Barlow Condensed with tabular figures so a live value
 * never jitters.
 */
val Scoreboard: TextStyle = TextStyle(
    fontFamily = BarlowCondensed,
    fontWeight = FontWeight.SemiBold,
    fontSize = 56.sp,
    lineHeight = 56.sp,
    fontFeatureSettings = TabularNumbers,
)

/** 24sp/700 DM Sans with tabular figures: a figure inside a card or row. */
val DataMedium: TextStyle = TextStyle(
    fontFamily = DmSans,
    fontWeight = FontWeight.Bold,
    fontSize = 24.sp,
    lineHeight = 28.sp,
    fontFeatureSettings = TabularNumbers,
)

/**
 * The tale-of-the-tape label: condensed capitals tracked +8% over a section
 * or a stat. Callers uppercase the text.
 */
val StatLabel: TextStyle = TextStyle(
    fontFamily = BarlowCondensed,
    fontWeight = FontWeight.SemiBold,
    fontSize = 14.sp,
    lineHeight = 16.sp,
    letterSpacing = 0.08.em,
)

/** Material typography mapped onto the docs/design.md scale. */
val AzfTypography: Typography = Typography(
    displayLarge = TextStyle(
        fontFamily = BarlowCondensed,
        fontWeight = FontWeight.SemiBold,
        fontSize = 48.sp,
        lineHeight = 52.sp,
        letterSpacing = 0.04.em,
    ),
    headlineLarge = TextStyle(
        fontFamily = BarlowCondensed,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 36.sp,
        letterSpacing = 0.03.em,
    ),
    headlineMedium = TextStyle(
        fontFamily = BarlowCondensed,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.02.em,
    ),
    headlineSmall = TextStyle(
        fontFamily = BarlowCondensed,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.02.em,
    ),
    titleLarge = TextStyle(
        fontFamily = BarlowCondensed,
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 26.sp,
        letterSpacing = 0.02.em,
    ),
    titleMedium = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.01.em,
    ),
    bodyLarge = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Normal,
        fontSize = 18.sp,
        lineHeight = 28.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.01.em,
    ),
    labelMedium = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.01.em,
    ),
    labelSmall = TextStyle(
        fontFamily = DmSans,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.02.em,
    ),
)
