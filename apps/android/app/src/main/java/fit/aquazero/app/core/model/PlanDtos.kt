package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Mirrors TS `AiMetadata`. */
@Serializable
data class AiMetadataDto(
    val provider: String = "",
    val model: String = "",
    val promptVersion: String = "",
    val confidence: Double? = null,
    val generatedAt: String = "",
    /** True when output came from the offline engine after provider failure. */
    val degraded: Boolean? = null,
)

/** Mirrors TS `SlotEntry`. */
@Serializable
data class SlotEntryDto(
    val id: String,
    val exerciseId: String,
    val sets: Int,
    val reps: Int,
    val restSeconds: Int,
    val notes: String? = null,
    val weightKg: Double? = null,
    val rir: Double? = null,
    val repsMax: Int? = null,
)

/** Mirrors TS `PlanSlot`. */
@Serializable
data class PlanSlotDto(
    val order: Int,
    val entries: List<SlotEntryDto> = emptyList(),
)

/** Mirrors TS `PlanDay`. */
@Serializable
data class PlanDayDto(
    val order: Int,
    val focus: String = "",
    val isRest: Boolean = false,
    val slots: List<PlanSlotDto> = emptyList(),
    val needLogsToAdvance: Boolean? = null,
)

/** Mirrors TS `ProgressionRule`. */
@Serializable
data class ProgressionRuleDto(
    val slotEntryId: String,
    val kind: String,
    val iteration: Int,
    val value: Double,
    val op: String? = null,
    val step: String? = null,
    val repeat: Boolean? = null,
    val requires: List<String>? = null,
)

/** Mirrors TS `TrainingPlan`. */
@Serializable
data class TrainingPlanDto(
    val id: String,
    val userId: String,
    val type: String = "trainingPlan",
    val name: String,
    val startDate: String,
    val endDate: String? = null,
    val currentIteration: Int = 1,
    val days: List<PlanDayDto> = emptyList(),
    val progressionRules: List<ProgressionRuleDto> = emptyList(),
    val generatedBy: AiMetadataDto? = null,
    val createdAt: String,
)

/** Response of `GET /plans/current` and `POST /plans/generate` — `{plan}`. */
@Serializable
data class PlanEnvelopeDto(
    val plan: TrainingPlanDto,
)

/** Mirrors TS `ReadinessSignal`. */
@Serializable
data class ReadinessSignalDto(
    val label: String,
    val detail: String = "",
)

/** Mirrors TS `ReadinessAssessment` — `GET /plans/readiness` → `{readiness}`. */
@Serializable
data class ReadinessAssessmentDto(
    /** Defaults to the most cautious mode: an unreadable mode never pushes harder. */
    val mode: ReadinessMode = ReadinessMode.PROTECT,
    val score: Int,
    val signals: List<ReadinessSignalDto> = emptyList(),
    val headline: String = "",
    val volumeMultiplier: Double = 1.0,
    val periodDays: Int = 7,
)

/** Envelope of `GET /plans/readiness`. */
@Serializable
data class ReadinessEnvelopeDto(
    val readiness: ReadinessAssessmentDto,
)

/** Mirrors TS `SetLog`. */
@Serializable
data class SetLogDto(
    val set: Int,
    val reps: Int,
    val weightKg: Double? = null,
    val rir: Double? = null,
    val completed: Boolean = false,
)

/** Mirrors TS `SessionExercise`. */
@Serializable
data class SessionExerciseDto(
    val exerciseId: String,
    val name: String,
    val setsPlanned: Int = 0,
    val setsCompleted: Int = 0,
    val reps: Int = 0,
    val restSeconds: Int = 0,
    val skipped: Boolean = false,
    val targetWeightKg: Double? = null,
    val targetReps: Int? = null,
    val targetRir: Double? = null,
    val weightKg: Double? = null,
    val rir: Double? = null,
    val setLogs: List<SetLogDto>? = null,
)

/** Mirrors TS `WorkoutSession`. */
@Serializable
data class WorkoutSessionDto(
    val id: String,
    val userId: String,
    val type: String = "workoutSession",
    val planId: String? = null,
    val planDayOrder: Int? = null,
    val focus: String = "",
    val exercises: List<SessionExerciseDto> = emptyList(),
    val status: WorkoutSessionStatus = WorkoutSessionStatus.PENDING,
    val startedAt: String? = null,
    val completedAt: String? = null,
    val durationMinutes: Int? = null,
    val kcalBurned: Double? = null,
    val localDate: String = "",
)

/**
 * Response of `GET /workouts/today`. Typed ONCE, per the plan's
 * envelope-trap note: derive per-consumer views from this, never cache
 * transformed slices.
 */
@Serializable
data class TodayWorkoutEnvelopeDto(
    val rest: Boolean = false,
    val focus: String = "",
    val iteration: Int = 1,
    val session: WorkoutSessionDto? = null,
    /** Exercise id → full exercise document for everything in today's session. */
    val exercises: Map<String, ExerciseDto> = emptyMap(),
    val planId: String? = null,
    val planName: String? = null,
    val localDate: String = "",
    val stalled: Boolean = false,
    /** Pre-computed resolved document (folded sets); null on rest days. */
    val resolved: kotlinx.serialization.json.JsonObject? = null,
)

/** Response of `POST /workouts/:id/complete` — `{session}`. */
@Serializable
data class WorkoutSessionEnvelopeDto(
    val session: WorkoutSessionDto,
)
