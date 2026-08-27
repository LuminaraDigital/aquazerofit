package fit.aquazero.app.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Deep Sea is dark-only by design: the single [darkColorScheme] below is the
 * whole theme. Values are ported verbatim from DESIGN.md via [AzfColors].
 */
private val DeepSeaColorScheme = darkColorScheme(
    primary = AzfColors.Primary,
    onPrimary = AzfColors.OnPrimary,
    primaryContainer = AzfColors.PrimaryContainer,
    onPrimaryContainer = AzfColors.OnPrimaryContainer,
    inversePrimary = AzfColors.InversePrimary,
    secondary = AzfColors.Secondary,
    onSecondary = AzfColors.OnSecondary,
    secondaryContainer = AzfColors.SecondaryContainer,
    onSecondaryContainer = AzfColors.OnSecondaryContainer,
    tertiary = AzfColors.Tertiary,
    onTertiary = AzfColors.OnTertiary,
    tertiaryContainer = AzfColors.TertiaryContainer,
    onTertiaryContainer = AzfColors.OnTertiaryContainer,
    background = AzfColors.Background,
    onBackground = AzfColors.OnBackground,
    surface = AzfColors.Surface,
    onSurface = AzfColors.OnSurface,
    surfaceVariant = AzfColors.SurfaceVariant,
    onSurfaceVariant = AzfColors.OnSurfaceVariant,
    surfaceTint = AzfColors.SurfaceTint,
    inverseSurface = AzfColors.InverseSurface,
    inverseOnSurface = AzfColors.InverseOnSurface,
    error = AzfColors.Error,
    onError = AzfColors.OnError,
    errorContainer = AzfColors.ErrorContainer,
    onErrorContainer = AzfColors.OnErrorContainer,
    outline = AzfColors.Outline,
    outlineVariant = AzfColors.OutlineVariant,
    surfaceBright = AzfColors.SurfaceBright,
    surfaceDim = AzfColors.SurfaceDim,
    surfaceContainer = AzfColors.SurfaceContainer,
    surfaceContainerHigh = AzfColors.SurfaceContainerHigh,
    surfaceContainerHighest = AzfColors.SurfaceContainerHighest,
    surfaceContainerLow = AzfColors.SurfaceContainerLow,
    surfaceContainerLowest = AzfColors.SurfaceContainerLowest,
)

/**
 * Brand tokens that have no Material role: the CTA gradient, ring track,
 * coral (the only color for weight gain) and the fixed-dim accents.
 */
@Immutable
data class AzfExtendedColors(
    /** 135° aqua→sea-green gradient for primary CTAs and completed goals. */
    val ctaGradient: Brush,
    /** Track color behind progress rings and bars. */
    val ringTrack: Color,
    /** Coral accent (weight gain, physiological markers). Never red. */
    val coral: Color,
    /** Vibrant aqua accent (`primary-fixed-dim`). */
    val primaryFixedDim: Color,
    /** Vibrant sea-green accent (`secondary-fixed-dim`). */
    val secondaryFixedDim: Color,
)

/** Default extended tokens; the gradient runs top-left → bottom-right (135°). */
val AzfExtended: AzfExtendedColors = AzfExtendedColors(
    ctaGradient = Brush.linearGradient(
        colors = listOf(AzfColors.PrimaryFixedDim, AzfColors.SecondaryFixedDim),
        start = Offset.Zero,
        end = Offset.Infinite,
    ),
    ringTrack = AzfColors.RingTrack,
    coral = AzfColors.Coral,
    primaryFixedDim = AzfColors.PrimaryFixedDim,
    secondaryFixedDim = AzfColors.SecondaryFixedDim,
)

/** Composition local for [AzfExtendedColors]; provided by [AzfTheme]. */
val LocalAzfExtended = staticCompositionLocalOf { AzfExtended }

/**
 * The AquaZeroFit theme. Wraps content in the Deep Sea color scheme, the
 * Barlow Condensed / DM Sans type system, the Liquid Geometric shapes, and
 * provides [LocalAzfExtended].
 */
@Composable
fun AzfTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalAzfExtended provides AzfExtended) {
        MaterialTheme(
            colorScheme = DeepSeaColorScheme,
            typography = AzfTypography,
            shapes = AzfMaterialShapes,
            content = content,
        )
    }
}
