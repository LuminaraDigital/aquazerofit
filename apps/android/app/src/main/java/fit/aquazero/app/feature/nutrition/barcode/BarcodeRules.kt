package fit.aquazero.app.feature.nutrition.barcode

import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.BarcodeLookupDto

/** How an allergen reaches the product. */
enum class AllergenWarningKind {
    /** No overlap with the user's declared allergies. */
    None,

    /** A declared ingredient allergen matches. */
    Contains,

    /** Only a "may contain traces" allergen matches. */
    MayContainTraces,
}

/** Deterministic outcome of the client-side allergen mirror. */
data class AllergenVerdict(
    val kind: AllergenWarningKind,
    /** Matching allergens, in the canonical `ALLERGENS` order. */
    val hits: List<Allergen>,
) {
    val hasWarning: Boolean get() = kind != AllergenWarningKind.None
}

/**
 * Barcode-sheet rules. All pure, all JVM-tested.
 *
 * The allergen mirror is the load-bearing part: it must never produce a false
 * negative. It therefore takes the **union** of every allergen list on the
 * lookup — the endpoint's own list, the food document's list, and traces —
 * rather than the web's `endpointList.length > 0 ? endpointList : foodList`.
 * A union is a superset of that choice, so it can only ever add a warning,
 * never remove one. Nothing here is inferred, guessed or model-derived: an
 * allergen must be declared in the data to be reported, and a declared one is
 * always reported.
 */
object BarcodeRules {

    /** Shortest barcode the API will accept a lookup for (EAN-8). */
    const val MIN_CODE_LENGTH: Int = 8

    /** Longest barcode worth sending (GTIN-14). */
    const val MAX_CODE_LENGTH: Int = 14

    /** Digits only — scanners and keypads both produce stray characters. */
    fun sanitize(raw: String): String = raw.filter { it.isDigit() }.take(MAX_CODE_LENGTH)

    /** True when [raw] has enough digits to be worth a lookup. */
    fun isSubmittable(raw: String): Boolean = sanitize(raw).length >= MIN_CODE_LENGTH

    /** Parse the profile's stored allergy CSV (Kotlin enum names). */
    fun parseProfileAllergies(csv: String): Set<Allergen> =
        csv.split(',')
            .mapNotNull { token ->
                val name = token.trim()
                if (name.isEmpty()) null else runCatching { Allergen.valueOf(name) }.getOrNull()
            }
            .toSet()

    /**
     * Intersect everything the lookup declares with the user's allergies.
     *
     * A declared-ingredient match outranks a traces-only match, because the
     * copy differs ("contains" vs "may contain traces of") — but either way the
     * warning is shown.
     */
    fun allergenVerdict(
        lookup: BarcodeLookupDto,
        profileAllergies: Set<Allergen>,
    ): AllergenVerdict {
        if (profileAllergies.isEmpty()) return AllergenVerdict(AllergenWarningKind.None, emptyList())

        val declared = buildSet {
            addAll(lookup.allergens)
            lookup.food?.allergens?.let(::addAll)
        }
        val traces = lookup.tracesAllergens.toSet()

        val declaredHits = Allergen.entries.filter { it in declared && it in profileAllergies }
        val tracesHits = Allergen.entries.filter {
            it in traces && it in profileAllergies && it !in declaredHits
        }

        return when {
            declaredHits.isNotEmpty() ->
                AllergenVerdict(AllergenWarningKind.Contains, declaredHits + tracesHits)

            tracesHits.isNotEmpty() ->
                AllergenVerdict(AllergenWarningKind.MayContainTraces, tracesHits)

            else -> AllergenVerdict(AllergenWarningKind.None, emptyList())
        }
    }

    /**
     * True when the record came from the live Open Food Facts API and the ODbL
     * attribution line is therefore mandatory.
     */
    fun requiresOffAttribution(lookup: BarcodeLookupDto): Boolean =
        lookup.origin == "off-api" ||
            lookup.food?.source?.contains("openfoodfacts", ignoreCase = true) == true ||
            lookup.food?.licence?.contains("ODbL", ignoreCase = true) == true
}
