package fit.aquazero.app.core.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalConfiguration
import java.util.Locale

/**
 * The locale the UI should format with, read as observable Compose state.
 *
 * `Locale.getDefault()` is a plain static read: a composable that calls it is
 * not invalidated when the user changes the system language, so weekday names
 * and number formats keep the language the screen first composed with.
 * Reading the locale off [LocalConfiguration] recomposes the caller instead.
 *
 * Compose's own `NonObservableLocale` lint points at
 * `androidx.compose.ui.platform.LocalLocale`, which does not exist yet in
 * Compose UI 1.12.0 — the check ships ahead of the API. Swap this body for it
 * once the artifact catches up; every call site already goes through here.
 */
@Composable
@ReadOnlyComposable
fun currentLocale(): Locale = LocalConfiguration.current.locales[0]
