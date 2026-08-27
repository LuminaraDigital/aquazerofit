package fit.aquazero.app.feature.training

import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.SessionExerciseDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.WorkoutSessionDto
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TrainingModelsTest {

    @Test
    fun `target line matches the web prescription format`() {
        val entry = ResolvedEntry(
            exerciseId = "ex1",
            name = "Barbell bench press",
            sets = 3,
            reps = 8,
            repsMax = 10,
            weightKg = 40.0,
            rir = 2.0,
            restSeconds = 90,
        )
        assertEquals("3 × 8–10", TrainingFormat.repScheme(entry))
        assertEquals("3 × 8–10 @ 40 kg • RiR 2 • 90s rest", TrainingFormat.targetLine(entry))
    }

    @Test
    fun `bodyweight and open RiR segments are omitted rather than rendered empty`() {
        val entry = ResolvedEntry(
            exerciseId = "ex2",
            name = "Push-up",
            sets = 3,
            reps = 12,
            restSeconds = 60,
        )
        assertEquals("3 × 12 • 60s rest", TrainingFormat.targetLine(entry))
    }

    @Test
    fun `fractional weights keep one decimal and whole ones drop it`() {
        assertEquals("40", TrainingFormat.number(40.0))
        assertEquals("42.5", TrainingFormat.number(42.5))
        assertEquals("2", TrainingFormat.number(2.0))
    }

    @Test
    fun `resolved exercises document is rendered verbatim`() {
        val resolved = json(
            """
            {
              "focus": "Upper",
              "exercises": [
                {
                  "exerciseId": "ex1",
                  "name": "Bench press",
                  "setsPlanned": 3,
                  "targetReps": 8,
                  "targetWeightKg": 40,
                  "targetRir": 2,
                  "restSeconds": 90
                }
              ]
            }
            """,
        )
        val entries = resolveEntries(
            TodayWorkoutEnvelopeDto(session = sessionWith(), resolved = resolved),
        )
        assertEquals(1, entries.size)
        assertEquals("Bench press", entries.first().name)
        assertEquals(40.0, entries.first().weightKg!!, 1e-9)
        assertEquals(90, entries.first().restSeconds)
    }

    @Test
    fun `flat entries document is also accepted`() {
        val resolved = json(
            """
            {
              "dayOrder": 1,
              "entries": [
                {
                  "exerciseId": "ex9",
                  "name": "Goblet squat",
                  "sets": 4,
                  "reps": 6,
                  "repsMax": 8,
                  "weightKg": 24,
                  "restSeconds": 120
                }
              ]
            }
            """,
        )
        val entries = resolveEntries(
            TodayWorkoutEnvelopeDto(session = sessionWith(), resolved = resolved),
        )
        assertEquals("4 × 6–8 @ 24 kg • 120s rest", TrainingFormat.targetLine(entries.first()))
    }

    @Test
    fun `falls back to the session document when no resolved model is present`() {
        val entries = resolveEntries(TodayWorkoutEnvelopeDto(session = sessionWith()))
        assertEquals(1, entries.size)
        assertEquals("Bench press", entries.first().name)
        assertEquals(35.0, entries.first().weightKg!!, 1e-9)
        assertEquals(8, entries.first().reps)
    }

    @Test
    fun `an unrecognised resolved shape degrades to the session fallback`() {
        val entries = resolveEntries(
            TodayWorkoutEnvelopeDto(
                session = sessionWith(),
                resolved = json("""{"somethingElse": true}"""),
            ),
        )
        assertEquals(1, entries.size)
        assertEquals("Bench press", entries.first().name)
    }

    @Test
    fun `a rest day resolves to no entries at all`() {
        assertTrue(resolveEntries(TodayWorkoutEnvelopeDto(rest = true)).isEmpty())
    }

    @Test
    fun `estimates mirror the web formulas and honour server values`() {
        val session = WorkoutSessionDto(
            id = "s",
            userId = "u",
            exercises = listOf(
                SessionExerciseDto(
                    exerciseId = "e",
                    name = "e",
                    setsPlanned = 3,
                    reps = 10,
                    restSeconds = 60,
                ),
            ),
        )
        // 3 × (10×4 + 60) = 300s = 5min → floored at 10.
        assertEquals(10, TrainingFormat.estimateMinutes(session))
        assertEquals(60, TrainingFormat.estimateKcal(session))
        assertEquals(42, TrainingFormat.estimateMinutes(session.copy(durationMinutes = 42)))
        assertEquals(3, TrainingFormat.totalSets(session))
    }

    @Test
    fun `csv columns decode into filter values`() {
        assertEquals(listOf("chest", "triceps"), csvValues("chest, triceps"))
        assertTrue(csvValues("").isEmpty())
        assertEquals(2, equipmentFromCsv("BARBELL,BENCH").size)
        assertTrue(equipmentFromCsv("NOT_A_THING").isEmpty())
    }

    @Test
    fun `attribution is assembled for every exercise that carries licence data`() {
        assertEquals(
            "© wger contributors, CC-BY-SA 4.0",
            ExerciseAttribution.exerciseCredit("wger contributors", "CC-BY-SA 4.0"),
        )
        assertEquals("CC-BY-SA 4.0", ExerciseAttribution.exerciseCredit("", "CC-BY-SA 4.0"))
        assertNull(ExerciseAttribution.exerciseCredit("", ""))
    }

    private fun json(raw: String): JsonObject =
        AzfJson.decodeFromString(JsonObject.serializer(), raw.trimIndent())

    private fun sessionWith(): WorkoutSessionDto = WorkoutSessionDto(
        id = "s1",
        userId = "u1",
        focus = "Upper",
        exercises = listOf(
            SessionExerciseDto(
                exerciseId = "ex1",
                name = "Bench press",
                setsPlanned = 3,
                reps = 8,
                restSeconds = 90,
                targetWeightKg = 35.0,
            ),
        ),
    )
}
