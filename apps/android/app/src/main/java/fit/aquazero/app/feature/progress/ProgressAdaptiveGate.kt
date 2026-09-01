package fit.aquazero.app.feature.progress

import fit.aquazero.app.core.common.AdaptiveExpenditureCalculator
import fit.aquazero.app.core.common.AdaptiveExpenditureResult
import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.TrendPointDto

/**
 * Adaptive expenditure for Progress, gated on server [adaptiveEnabled].
 * Extracted for unit testing without Hilt/Room.
 */
internal fun adaptiveExpenditureIfEnabled(
    adaptiveEnabled: Boolean,
    weightHistory: List<TrendPointDto>,
    calorieHistory: List<TrendPointDto>,
    baselineTdee: Double,
    sex: Sex,
): AdaptiveExpenditureResult? {
    if (!adaptiveEnabled) return null
    return AdaptiveExpenditureCalculator.calculate(
        weightHistory = weightHistory,
        calorieHistory = calorieHistory,
        baselineTdee = baselineTdee,
        sex = sex,
    )
}
