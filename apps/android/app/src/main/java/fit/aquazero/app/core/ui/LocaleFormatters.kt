package fit.aquazero.app.core.ui

import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * Compile-once [DateTimeFormatter] cache, keyed on the locale as well as the
 * pattern.
 *
 * `DateTimeFormatter.ofPattern` re-parses and re-compiles the pattern on every
 * call, so calling it from inside a composable — or from a helper a lazy list
 * runs per row — pays that cost on every recomposition and every scroll.
 *
 * The obvious fix is a file-level `val` built with `Locale.getDefault()`, and
 * it is wrong: it snapshots the locale at class-load time, so a user who
 * changes the system language keeps the old formatting until the process is
 * killed. Resolving the default locale per call and using it as part of the
 * cache key keeps the compile-once win *and* re-derives after a locale change
 * — the lookup is a hash-map read, not a pattern compile.
 *
 * Thread-safe: [DateTimeFormatter] is immutable and the map is concurrent. The
 * key space is bounded by the handful of patterns the app uses times the
 * handful of locales one device will ever be set to.
 */
object LocaleFormatters {

    private data class Key(val pattern: String, val locale: Locale)

    private val cache = ConcurrentHashMap<Key, DateTimeFormatter>()

    /**
     * The formatter for [pattern] in [locale], compiled once per pair.
     *
     * [locale] defaults to the *current* system locale, re-read on every call.
     */
    fun of(pattern: String, locale: Locale = Locale.getDefault()): DateTimeFormatter =
        cache.computeIfAbsent(Key(pattern, locale)) { DateTimeFormatter.ofPattern(it.pattern, it.locale) }
}
