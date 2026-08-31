package fit.aquazero.app.core.vision

import kotlin.math.abs
import kotlin.math.atan2

/**
 * 2D normalized landmark coordinate [0.0, 1.0].
 */
data class LandmarkPoint(
    val x: Float,
    val y: Float,
    val visibility: Float = 1.0f,
)

/**
 * Squat state in the repetition cycle.
 */
enum class SquatPhase {
    STANDING,
    DESCENDING,
    BOTTOM_DEPTH,
    ASCENDING,
}

/**
 * Live Form Check evaluation output.
 */
data class FormCheckResult(
    val repsCompleted: Int,
    val currentPhase: SquatPhase,
    val kneeAngleDeg: Float,
    val hipAngleDeg: Float,
    val depthAchieved: Boolean,
    val feedback: String,
)

/**
 * On-Device Real-Time Form Check & Pose Estimation Math Engine.
 *
 * Runs locally on the client without uploading frames to any server,
 * fully preserving user privacy (AQF-11).
 *
 * Implements 3-point joint angle trigonometry and an inflection-point
 * state machine for squat depth and rep cadence validation.
 */
class SquatFormAnalyzer {

    private var repCount = 0
    private var phase = SquatPhase.STANDING
    private var reachedDepthInCurrentRep = false

    fun reset() {
        repCount = 0
        phase = SquatPhase.STANDING
        reachedDepthInCurrentRep = false
    }

    /**
     * Calculate internal joint angle between points A-B-C (where B is the vertex/joint).
     */
    fun calculateAngle(a: LandmarkPoint, b: LandmarkPoint, c: LandmarkPoint): Float {
        val radians = atan2(c.y - b.y, c.x - b.x) - atan2(a.y - b.y, a.x - b.x)
        var degrees = abs(Math.toDegrees(radians.toDouble()).toFloat())
        if (degrees > 180f) {
            degrees = 360f - degrees
        }
        return degrees
    }

    /**
     * Process landmark frame:
     * - [hip]: Hip joint
     * - [knee]: Knee joint
     * - [ankle]: Ankle joint
     * - [shoulder]: Shoulder joint
     */
    fun processFrame(
        hip: LandmarkPoint,
        knee: LandmarkPoint,
        ankle: LandmarkPoint,
        shoulder: LandmarkPoint? = null,
    ): FormCheckResult {
        val kneeAngle = calculateAngle(hip, knee, ankle)
        val hipAngle = shoulder?.let { calculateAngle(shoulder, hip, knee) } ?: 180f

        var feedback = "Ready"

        when (phase) {
            SquatPhase.STANDING -> {
                if (kneeAngle < 150f) {
                    phase = SquatPhase.DESCENDING
                    feedback = "Descending..."
                } else {
                    feedback = "Stand tall to begin"
                }
            }
            SquatPhase.DESCENDING -> {
                if (kneeAngle <= 95f) {
                    phase = SquatPhase.BOTTOM_DEPTH
                    reachedDepthInCurrentRep = true
                    feedback = "Good depth! Drive up!"
                } else if (kneeAngle < 120f) {
                    feedback = "Lower... hit parallel"
                }
            }
            SquatPhase.BOTTOM_DEPTH -> {
                if (kneeAngle >= 160f) {
                    if (reachedDepthInCurrentRep) {
                        repCount++
                        feedback = "Rep $repCount complete!"
                    }
                    phase = SquatPhase.STANDING
                    reachedDepthInCurrentRep = false
                } else if (kneeAngle > 105f) {
                    phase = SquatPhase.ASCENDING
                    feedback = "Driving up..."
                }
            }
            SquatPhase.ASCENDING -> {
                if (kneeAngle >= 160f) {
                    if (reachedDepthInCurrentRep) {
                        repCount++
                        feedback = "Rep $repCount complete!"
                    } else {
                        feedback = "Incomplete depth — go lower next rep"
                    }
                    phase = SquatPhase.STANDING
                    reachedDepthInCurrentRep = false
                }
            }
        }

        return FormCheckResult(
            repsCompleted = repCount,
            currentPhase = phase,
            kneeAngleDeg = kneeAngle,
            hipAngleDeg = hipAngle,
            depthAchieved = reachedDepthInCurrentRep,
            feedback = feedback,
        )
    }
}
