package fit.aquazero.app.core.ui

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.util.Locale

/**
 * The formatter cache exists to stop `DateTimeFormatter.ofPattern` running
 * inside composition, and the interesting part is what it does when the
 * *locale* moves rather than the pattern.
 *
 * A plain file-level `val` would pass a caching test and still be wrong: it
 * snapshots the default locale at class-load time and never lets go of it.
 * The re-derivation case below is the one that fails against that version.
 */
class LocaleFormattersTest {

    private lateinit var original: Locale
    private val august = LocalDate.of(2026, 8, 29)

    @Before
    fun captureDefault() {
        original = Locale.getDefault()
    }

    @After
    fun restoreDefault() {
        Locale.setDefault(original)
    }

    @Test
    fun `formats in the requested locale`() {
        assertEquals("29 August 2026", august.format(LocaleFormatters.of("d MMMM yyyy", Locale.UK)))
    }

    @Test
    fun `compiles a pattern once per locale`() {
        val first = LocaleFormatters.of("d MMM yyyy", Locale.UK)
        val second = LocaleFormatters.of("d MMM yyyy", Locale.UK)

        assertSame(first, second)
    }

    @Test
    fun `the locale is part of the cache key`() {
        val uk = LocaleFormatters.of("d MMMM", Locale.UK)
        val france = LocaleFormatters.of("d MMMM", Locale.FRANCE)

        assertNotEquals(august.format(uk), august.format(france))
        assertEquals(Locale.UK, uk.locale)
        assertEquals(Locale.FRANCE, france.locale)
    }

    @Test
    fun `re-derives after the default locale changes`() {
        Locale.setDefault(Locale.UK)
        val before = august.format(LocaleFormatters.of("d MMMM"))

        Locale.setDefault(Locale.FRANCE)
        val after = august.format(LocaleFormatters.of("d MMMM"))

        assertEquals("29 August", before)
        assertNotEquals(before, after)
    }
}
