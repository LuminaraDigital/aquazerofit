package fit.aquazero.app.feature.coach

import androidx.annotation.StringRes
import fit.aquazero.app.R
import fit.aquazero.app.core.database.ChatMessageEntity

/**
 * What the conversation shows after a turn settles.
 *
 * Out of credits is a different fact from a dropped reply. The 2026-11-02
 * replay rendered HTTP 402 as [TurnFailure.Dropped], whose copy says the
 * message was saved, and then cleared the optimistic line. A 402 never writes
 * the turn, so the sentence the user just sent has to stay on screen, and the
 * note has to name credits.
 *
 * Safety refusals are already in history as supportive assistant messages.
 * Surfacing a frame too would show them twice, so those results map to null.
 */
internal fun coachTurnFailure(result: ChatTurnResult): TurnFailure? = when (result) {
    ChatTurnResult.Unavailable -> TurnFailure.Unavailable
    ChatTurnResult.Dropped -> TurnFailure.Dropped
    ChatTurnResult.OutOfCredits -> TurnFailure.OutOfCredits
    ChatTurnResult.Completed,
    is ChatTurnResult.Recovered,
    is ChatTurnResult.SafetyHandled,
    -> null
}

/**
 * The optimistic user line after [result].
 *
 * [sent] is restored for a credits refusal even if a history refresh already
 * retired the bubble: an older line with the same words is not this turn, and
 * this turn was not stored. A dropped reply keeps [sent] only until history
 * actually contains it, because that frame tells the user the message was
 * saved. A finished turn drops the bubble so the real row is not shown twice.
 */
internal fun pendingUserMessageAfterTurn(
    result: ChatTurnResult,
    sent: String,
    pending: String?,
    messages: List<ChatMessageEntity>,
): String? = when (result) {
    ChatTurnResult.OutOfCredits -> sent
    ChatTurnResult.Unavailable -> pending
    ChatTurnResult.Dropped -> sent.takeUnless { text -> messages.hasUserLine(text) }
    ChatTurnResult.Completed,
    is ChatTurnResult.Recovered,
    is ChatTurnResult.SafetyHandled,
    -> null
}

/**
 * Keep or retire the optimistic line when history emits.
 *
 * A credits failure keeps it even when an older message has the same content.
 * Every other state retires it once that content is already in the thread.
 */
internal fun retainPendingUserMessage(
    pending: String?,
    failure: TurnFailure?,
    messages: List<ChatMessageEntity>,
): String? {
    if (pending == null) return null
    if (failure == TurnFailure.OutOfCredits) return pending
    return pending.takeIf { text -> messages.none { it.content == text } }
}

/**
 * Dismissing the note must not take the sentence off the thread when the
 * note either says the message was saved, or the turn was refused before
 * it could be saved.
 */
internal fun pendingUserMessageAfterDismiss(
    failure: TurnFailure?,
    pending: String?,
): String? = when (failure) {
    TurnFailure.OutOfCredits, TurnFailure.Dropped -> pending
    TurnFailure.Unavailable, null -> null
}

/** Copy for a failed turn. Credits uses the meal-plan sentence, without the meal-logging tail. */
@StringRes
internal fun coachTurnFailureMessageRes(failure: TurnFailure): Int = when (failure) {
    TurnFailure.Unavailable -> R.string.coach_error_unavailable
    TurnFailure.Dropped -> R.string.coach_error_dropped
    TurnFailure.OutOfCredits -> R.string.coach_error_credits
}

private fun List<ChatMessageEntity>.hasUserLine(text: String): Boolean =
    any { it.role == USER_ROLE && it.content == text }

private const val USER_ROLE = "user"
