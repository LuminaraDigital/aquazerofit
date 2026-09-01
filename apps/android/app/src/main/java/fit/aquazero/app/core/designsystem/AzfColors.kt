package fit.aquazero.app.core.designsystem

import androidx.compose.ui.graphics.Color

/**
 * Deep Sea palette — ported verbatim from
 * `design/figma/modern_aquatic_wellness/DESIGN.md`. This file is the single
 * source of truth for raw color values; everything else reads the
 * [androidx.compose.material3.ColorScheme] built in [AzfTheme] or the
 * [AzfExtended] tokens.
 */
object AzfColors {
    val Surface = Color(0xFF0E1416)
    val SurfaceDim = Color(0xFF0E1416)
    val SurfaceBright = Color(0xFF343A3C)
    val SurfaceContainerLowest = Color(0xFF090F11)
    val SurfaceContainerLow = Color(0xFF161D1E)
    val SurfaceContainer = Color(0xFF1A2122)
    val SurfaceContainerHigh = Color(0xFF242B2D)
    val SurfaceContainerHighest = Color(0xFF2F3638)
    val OnSurface = Color(0xFFDDE4E5)
    val OnSurfaceVariant = Color(0xFFBBC9CD)
    val InverseSurface = Color(0xFFDDE4E5)
    val InverseOnSurface = Color(0xFF2B3233)
    val Outline = Color(0xFF859397)
    val OutlineVariant = Color(0xFF3C494C)
    val SurfaceTint = Color(0xFF2FD9F4)
    val Primary = Color(0xFF8AEBFF)
    val OnPrimary = Color(0xFF00363E)
    val PrimaryContainer = Color(0xFF22D3EE)
    val OnPrimaryContainer = Color(0xFF005763)
    val InversePrimary = Color(0xFF006877)
    val Secondary = Color(0xFF45DFA4)
    val OnSecondary = Color(0xFF003825)
    val SecondaryContainer = Color(0xFF00BD85)
    val OnSecondaryContainer = Color(0xFF00452E)
    val Tertiary = Color(0xFFFFD2D5)
    val OnTertiary = Color(0xFF67001F)
    val TertiaryContainer = Color(0xFFFFAAB2)
    val OnTertiaryContainer = Color(0xFF94223A)
    val Error = Color(0xFFFFB4AB)
    val OnError = Color(0xFF690005)
    val ErrorContainer = Color(0xFF93000A)
    val OnErrorContainer = Color(0xFFFFDAD6)
    val PrimaryFixed = Color(0xFFA2EEFF)
    val PrimaryFixedDim = Color(0xFF2FD9F4)
    val OnPrimaryFixed = Color(0xFF001F25)
    val OnPrimaryFixedVariant = Color(0xFF004E5A)
    val SecondaryFixed = Color(0xFF68FCBF)
    val SecondaryFixedDim = Color(0xFF45DFA4)
    val OnSecondaryFixed = Color(0xFF002114)
    val OnSecondaryFixedVariant = Color(0xFF005137)
    val TertiaryFixed = Color(0xFFFFDADC)
    val TertiaryFixedDim = Color(0xFFFFB2B9)
    val OnTertiaryFixed = Color(0xFF400010)
    val OnTertiaryFixedVariant = Color(0xFF891933)
    val Background = Color(0xFF0E1416)
    val OnBackground = Color(0xFFDDE4E5)
    val SurfaceVariant = Color(0xFF2F3638)

    /** Progress-ring track (Level 1 border color from DESIGN.md elevation). */
    val RingTrack = Color(0xFF1E4C74)

    /** Coral accent — the only color for weight *gain* (never red). */
    val Coral = Color(0xFFFFB2B9)
}
