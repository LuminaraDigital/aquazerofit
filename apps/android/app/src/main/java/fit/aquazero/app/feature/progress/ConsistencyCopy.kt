package fit.aquazero.app.feature.progress

import androidx.annotation.StringRes
import fit.aquazero.app.R
import fit.aquazero.app.core.network.dto.ConsistencyState
import fit.aquazero.app.core.network.dto.ConsistencyStatusDto

/**
 * The single, auditable vocabulary for consistency — a direct port of the
 * web's `consistencyCopy.ts`, kept in one file for the same reason: the copy
 * is the safety-critical part of this surface.
 *
 * Rules encoded here rather than left to call sites:
 *  - The headline is always `activeDays of the last windowDays`. That number
 *    is monotonic in effort and can never be reset to zero by a missed day.
 *  - The current run is secondary, and is omitted rather than rendered as 0.
 *  - There is no vocabulary for loss: no "broken", "lost", "missed", "failed".
 *  - Absorbed (grace) days read as reassurance, never as a warning.
 */
object ConsistencyCopy {

    /** Grace days the server allows before a run is considered paused. */
    const val GRACE_DAYS = 2

    /** Short badge word for a state. Describes the rhythm, never the person. */
    @StringRes
    fun stateLabel(state: ConsistencyState): Int = when (state) {
        ConsistencyState.RESTING -> R.string.consistency_state_resting
        ConsistencyState.RECOVERING -> R.string.consistency_state_recovering
        ConsistencyState.BUILDING -> R.string.consistency_state_building
        ConsistencyState.STEADY -> R.string.consistency_state_steady
    }

    /**
     * The supportive line beneath the headline. Grace reassurance takes
     * precedence over the plain state line.
     */
    @StringRes
    fun body(status: ConsistencyStatusDto): Int = when {
        hasAbsorbedDay(status) -> R.string.consistency_body_grace
        status.state == ConsistencyState.RESTING -> R.string.consistency_body_resting
        status.state == ConsistencyState.RECOVERING -> R.string.consistency_body_recovering
        status.state == ConsistencyState.BUILDING -> R.string.consistency_body_building
        else -> R.string.consistency_body_steady
    }

    /** True when the run has already used part of its grace allowance. */
    fun hasAbsorbedDay(status: ConsistencyStatusDto): Boolean =
        status.currentDays > 0 && status.graceRemaining < GRACE_DAYS

    /** Proportion of the window with activity, clamped to 0–1 for meters. */
    fun fraction(status: ConsistencyStatusDto): Float {
        if (status.windowDays <= 0) return 0f
        return (status.activeDays.toFloat() / status.windowDays.toFloat()).coerceIn(0f, 1f)
    }

    /** True once anything has been logged inside the window. */
    fun hasActivity(status: ConsistencyStatusDto): Boolean = status.activeDays > 0

    /** Current run, or null at zero — never rendered as "0 days". */
    fun currentRunDays(status: ConsistencyStatusDto): Int? =
        status.currentDays.takeIf { it > 0 }

    /** All-time best, so a short run never erases past effort. */
    fun bestDays(status: ConsistencyStatusDto): Int? = status.bestDays.takeIf { it > 0 }
}
