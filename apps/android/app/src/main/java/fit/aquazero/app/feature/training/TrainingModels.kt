package fit.aquazero.app.feature.training

import fit.aquazero.app.core.model.PlanDayDto
import fit.aquazero.app.core.model.SessionExerciseDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.ui.NutritionFormat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

/**
 * One exercise's resolved prescription for today — the "3 × 8–10 @ 40 kg •
 * RiR 2 • 90s rest" read model the web renders verbatim.
 *
 * The server may pre-compute this into the `/workouts/today` envelope's
 * `resolved` field (two historical shapes, both handled below). When it is
 * absent — including every offline read, where only the cached session
 * document exists — the same prescription is derived from the session's own
 * target columns so the mobile client never degrades to "N sets" alone.
 */
data class ResolvedEntry(
    val exerciseId: String,
    val name: String,
    val sets: Int,
    val reps: Int,
    val repsMax: Int? = null,
    val weightKg: Double? = null,
    val rir: Double? = null,
    val restSeconds: Int,
    val notes: String? = null,
)

/**
 * Which plan day a calendar date falls on. A plan is a seven-day cycle repeated
 * from its start date, not a Monday-to-Sunday week, and the server resolves
 * today's session the same way (`readiness.ts`); the two must never disagree.
 */
object PlanCalendar {
    private const val CYCLE_DAYS = 7L

    fun dayOn(days: List<PlanDayDto>, startDate: String, date: LocalDate): PlanDayDto? {
        val start = runCatching { LocalDate.parse(startDate.take(ISO_DATE_LENGTH)) }.getOrNull() ?: return null
        if (date.isBefore(start)) return null
        val order = (ChronoUnit.DAYS.between(start, date) % CYCLE_DAYS).toInt() + 1
        return days.firstOrNull { it.order == order }
    }

    private const val ISO_DATE_LENGTH = 10
}

/** Formatting + envelope-shaping helpers shared by the library and session screens. */
object TrainingFormat {

    /** "3 × 8–10", collapsing to "3 × 8" when there is no rep range. */
    fun repScheme(entry: ResolvedEntry): String {
        val reps = if (entry.repsMax != null && entry.repsMax != entry.reps) {
            "${entry.reps}–${entry.repsMax}"
        } else {
            entry.reps.toString()
        }
        return "${entry.sets} × $reps"
    }

    /**
     * The full one-line prescription:
     * `3 × 8–10 @ 40 kg • RiR 2 • 90s rest`. Segments that carry no value
     * (bodyweight, no RiR target) are omitted rather than rendered empty.
     */
    fun targetLine(entry: ResolvedEntry): String = buildString {
        append(repScheme(entry))
        entry.weightKg?.let { append(" @ ${number(it)} kg") }
        entry.rir?.let { append(" • RiR ${number(it)}") }
        append(" • ${entry.restSeconds}s rest")
    }

    /** Trim a trailing `.0` so whole numbers read as "40", not "40.0". */
    fun number(value: Double): String =
        if (value == value.roundToInt().toDouble()) {
            value.roundToInt().toString()
        } else {
            String.format(java.util.Locale.US, "%.1f", value)
        }

    /**
     * Session length. Home uses the same function (`NutritionFormat`), so a
     * workout cannot read 30 minutes in one place and 27 in another.
     */
    fun estimateMinutes(session: WorkoutSessionDto): Int =
        NutritionFormat.estimateDurationMinutes(session)

    /** Burn estimate, matching the web: ~5.5 kcal/min rounded to the nearest 10. */
    fun estimateKcal(session: WorkoutSessionDto): Int {
        session.kcalBurned?.let { return it.roundToInt() }
        return (estimateMinutes(session) * 5.5 / 10).roundToInt() * 10
    }

    /** Total planned sets across the session — the guided progress denominator. */
    fun totalSets(session: WorkoutSessionDto): Int = session.exercises.sumOf { it.setsPlanned }
}

/**
 * Derive the resolved prescription for today's session.
 *
 * Precedence: the server's pre-computed `resolved` document (rendered
 * verbatim), then the session's own target fields. The envelope is typed once
 * ([TodayWorkoutEnvelopeDto]) per the plan's envelope-trap note — this
 * function derives a view from it and never caches the transformed slice.
 */
fun resolveEntries(envelope: TodayWorkoutEnvelopeDto): List<ResolvedEntry> {
    val session = envelope.session ?: return emptyList()
    val fromResolved = envelope.resolved?.let(::parseResolved).orEmpty()
    if (fromResolved.isNotEmpty()) return fromResolved
    return resolveFromSession(session.exercises)
}

/** Fallback prescription built from the session document's own target columns. */
fun resolveFromSession(exercises: List<SessionExerciseDto>): List<ResolvedEntry> =
    exercises.map { ex ->
        ResolvedEntry(
            exerciseId = ex.exerciseId,
            name = ex.name,
            sets = ex.setsPlanned,
            reps = ex.targetReps ?: ex.reps,
            repsMax = null,
            weightKg = ex.targetWeightKg ?: ex.weightKg,
            rir = ex.targetRir ?: ex.rir,
            restSeconds = ex.restSeconds,
        )
    }

/**
 * Parse the optional `resolved` read model. Two shapes have shipped:
 * `{exercises: [{exerciseId, name, setsPlanned, targetReps, …, sets: [...]}]}`
 * and the flatter `{entries: [{exerciseId, name, sets, reps, …}]}`. Both are
 * accepted; anything else yields an empty list and the session fallback runs.
 */
private fun parseResolved(resolved: JsonObject): List<ResolvedEntry> {
    (resolved["exercises"] as? JsonArray)?.let { array ->
        val mapped = array.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val firstSet = (obj["sets"] as? JsonArray)?.firstOrNull() as? JsonObject
            ResolvedEntry(
                exerciseId = obj.str("exerciseId") ?: return@mapNotNull null,
                name = obj.str("name").orEmpty(),
                sets = obj.int("setsPlanned") ?: 0,
                reps = obj.int("targetReps") ?: firstSet?.int("reps") ?: 0,
                repsMax = obj.int("targetRepsMax") ?: obj.int("repsMax"),
                weightKg = obj.dbl("targetWeightKg") ?: firstSet?.dbl("weightKg"),
                rir = obj.dbl("targetRir") ?: firstSet?.dbl("rir"),
                restSeconds = obj.int("restSeconds") ?: firstSet?.int("restSeconds") ?: 0,
                notes = obj.str("notes"),
            )
        }
        if (mapped.isNotEmpty()) return mapped
    }
    (resolved["entries"] as? JsonArray)?.let { array ->
        return array.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            ResolvedEntry(
                exerciseId = obj.str("exerciseId") ?: return@mapNotNull null,
                name = obj.str("name").orEmpty(),
                sets = obj.int("sets") ?: 0,
                reps = obj.int("reps") ?: 0,
                repsMax = obj.int("repsMax"),
                weightKg = obj.dbl("weightKg"),
                rir = obj.dbl("rir"),
                restSeconds = obj.int("restSeconds") ?: 0,
                notes = obj.str("notes"),
            )
        }
    }
    return emptyList()
}

private fun JsonObject.str(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull

private fun JsonObject.dbl(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
