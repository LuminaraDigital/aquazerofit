package fit.aquazero.app.core.common

import fit.aquazero.app.core.database.WorkoutSessionEntity
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.model.WorkoutSessionStatus

/** Burn credited for a cached session row (completed sessions only). */
fun kcalBurnedFromSession(entity: WorkoutSessionEntity?): Double {
    if (entity == null) return 0.0
    if (!entity.status.equals(WorkoutSessionStatus.COMPLETED.name, ignoreCase = true)) return 0.0
    val session = runCatching {
        AzfJson.decodeFromString(WorkoutSessionDto.serializer(), entity.docJson)
    }.getOrNull() ?: return 0.0
    return session.kcalBurned?.coerceAtLeast(0.0) ?: 0.0
}
