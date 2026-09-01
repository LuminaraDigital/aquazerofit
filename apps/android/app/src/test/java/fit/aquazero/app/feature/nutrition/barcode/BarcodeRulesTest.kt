package fit.aquazero.app.feature.nutrition.barcode

import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.BarcodeLookupDto
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The deterministic allergen mirror and the barcode input rules.
 *
 * The rule this file defends: **zero false negatives.** If any list on the
 * lookup declares an allergen the user is allergic to, the warning is shown.
 */
class BarcodeRulesTest {

    private fun food(vararg allergens: Allergen) = FoodDto(
        id = "food-1",
        name = "Test product",
        per100g = FoodNutrientsDto(kcal = 100.0, proteinG = 1.0, carbsG = 10.0, fatG = 5.0),
        allergens = allergens.toList(),
    )

    private fun lookup(
        foodAllergens: List<Allergen> = emptyList(),
        endpointAllergens: List<Allergen> = emptyList(),
        traces: List<Allergen> = emptyList(),
        origin: String = "local",
    ) = BarcodeLookupDto(
        food = food(*foodAllergens.toTypedArray()),
        allergens = endpointAllergens,
        tracesAllergens = traces,
        origin = origin,
    )

    // ----- allergen mirror -----

    @Test
    fun `a declared ingredient allergen produces a contains warning`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(endpointAllergens = listOf(Allergen.PEANUTS, Allergen.SOY)),
            setOf(Allergen.PEANUTS),
        )

        assertEquals(AllergenWarningKind.Contains, verdict.kind)
        assertEquals(listOf(Allergen.PEANUTS), verdict.hits)
        assertTrue(verdict.hasWarning)
    }

    @Test
    fun `a traces-only match produces the traces wording`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(traces = listOf(Allergen.TREE_NUTS)),
            setOf(Allergen.TREE_NUTS),
        )

        assertEquals(AllergenWarningKind.MayContainTraces, verdict.kind)
        assertEquals(listOf(Allergen.TREE_NUTS), verdict.hits)
    }

    @Test
    fun `an ingredient match outranks a traces match but keeps both`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(endpointAllergens = listOf(Allergen.MILK), traces = listOf(Allergen.PEANUTS)),
            setOf(Allergen.MILK, Allergen.PEANUTS),
        )

        assertEquals(AllergenWarningKind.Contains, verdict.kind)
        assertTrue(Allergen.MILK in verdict.hits)
        assertTrue(Allergen.PEANUTS in verdict.hits)
    }

    /**
     * The one that matters: the endpoint list being non-empty must never hide
     * an allergen that only the food document declares.
     */
    @Test
    fun `an allergen declared only on the food document is never missed`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(
                foodAllergens = listOf(Allergen.SESAME),
                endpointAllergens = listOf(Allergen.WHEAT),
            ),
            setOf(Allergen.SESAME),
        )

        assertEquals(AllergenWarningKind.Contains, verdict.kind)
        assertEquals(listOf(Allergen.SESAME), verdict.hits)
    }

    @Test
    fun `an allergen declared only by the endpoint is never missed`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(foodAllergens = listOf(Allergen.WHEAT), endpointAllergens = listOf(Allergen.EGGS)),
            setOf(Allergen.EGGS),
        )

        assertEquals(AllergenWarningKind.Contains, verdict.kind)
        assertEquals(listOf(Allergen.EGGS), verdict.hits)
    }

    @Test
    fun `no overlap means no warning`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(endpointAllergens = listOf(Allergen.FISH), traces = listOf(Allergen.SHELLFISH)),
            setOf(Allergen.PEANUTS),
        )

        assertEquals(AllergenWarningKind.None, verdict.kind)
        assertFalse(verdict.hasWarning)
        assertTrue(verdict.hits.isEmpty())
    }

    @Test
    fun `a user with no declared allergies gets no warning`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(endpointAllergens = Allergen.entries.toList()),
            emptySet(),
        )

        assertEquals(AllergenWarningKind.None, verdict.kind)
    }

    @Test
    fun `an allergen-free product with an allergic user is silent`() {
        val verdict = BarcodeRules.allergenVerdict(lookup(), setOf(Allergen.MILK))
        assertFalse(verdict.hasWarning)
    }

    @Test
    fun `hits keep the canonical allergen order`() {
        val verdict = BarcodeRules.allergenVerdict(
            lookup(endpointAllergens = listOf(Allergen.SESAME, Allergen.PEANUTS, Allergen.MILK)),
            setOf(Allergen.SESAME, Allergen.PEANUTS, Allergen.MILK),
        )

        assertEquals(listOf(Allergen.PEANUTS, Allergen.MILK, Allergen.SESAME), verdict.hits)
    }

    @Test
    fun `a lookup with no food still evaluates safely`() {
        val verdict = BarcodeRules.allergenVerdict(
            BarcodeLookupDto(food = null, allergens = listOf(Allergen.SOY)),
            setOf(Allergen.SOY),
        )

        assertEquals(AllergenWarningKind.Contains, verdict.kind)
    }

    // ----- profile parsing -----

    @Test
    fun `profile allergies parse from the stored csv`() {
        assertEquals(
            setOf(Allergen.PEANUTS, Allergen.TREE_NUTS),
            BarcodeRules.parseProfileAllergies("PEANUTS,TREE_NUTS"),
        )
        assertEquals(emptySet<Allergen>(), BarcodeRules.parseProfileAllergies(""))
        assertEquals(
            setOf(Allergen.MILK),
            BarcodeRules.parseProfileAllergies(" MILK , , NOT_A_REAL_ALLERGEN "),
        )
    }

    // ----- code input -----

    @Test
    fun `codes are reduced to digits`() {
        assertEquals("3017620422003", BarcodeRules.sanitize(" 3017-6204 22003 "))
        assertEquals("", BarcodeRules.sanitize("abc"))
    }

    @Test
    fun `only long enough codes are submittable`() {
        assertFalse(BarcodeRules.isSubmittable("1234567"))
        assertTrue(BarcodeRules.isSubmittable("12345678"))
        assertTrue(BarcodeRules.isSubmittable("3017620422003"))
    }

    @Test
    fun `overlong input is truncated to a gtin length`() {
        assertEquals(
            BarcodeRules.MAX_CODE_LENGTH,
            BarcodeRules.sanitize("123456789012345678901234").length,
        )
    }

    // ----- ODbL attribution -----

    @Test
    fun `open food facts records always carry attribution`() {
        assertTrue(BarcodeRules.requiresOffAttribution(lookup(origin = "off-api")))
        assertTrue(
            BarcodeRules.requiresOffAttribution(
                BarcodeLookupDto(
                    food = food().copy(source = "OpenFoodFacts"),
                    origin = "local",
                ),
            ),
        )
        assertTrue(
            BarcodeRules.requiresOffAttribution(
                BarcodeLookupDto(food = food().copy(licence = "ODbL-1.0"), origin = "local"),
            ),
        )
    }

    @Test
    fun `a non-off record needs no attribution line`() {
        assertFalse(
            BarcodeRules.requiresOffAttribution(
                BarcodeLookupDto(
                    food = food().copy(source = "usda", licence = "public-domain"),
                    origin = "local",
                ),
            ),
        )
    }
}
