package fit.aquazero.app.core.common

import kotlinx.coroutines.CoroutineExceptionHandler

/**
 * Keeps a failure in a long-lived background scope from killing the app.
 *
 * `SupervisorJob()` is widely misread as covering this. It does not: it stops a
 * failing child from cancelling its *siblings*, but an exception that reaches
 * the top of a coroutine still looks for a [CoroutineExceptionHandler] in the
 * context, and finding none it goes to the thread's default uncaught handler —
 * which is process death. So before this existed, anything thrown by the
 * connectivity observer, the telemetry consent gate or the Play purchase
 * recovery that runs at startup took the whole app down, from a coroutine no
 * screen was waiting on.
 *
 * What it deliberately does NOT do is report anywhere. Two reasons:
 *
 *  - This app writes nothing to logcat by design — there is not a single
 *    `Log.*` call in the production source set, because a stack trace's
 *    message can carry a token or a fragment of somebody's health data, and
 *    logcat is readable by more things than people expect. Adding the first one
 *    here would trade a crash for a leak.
 *  - Genuine fatal crashes are already collected. Play Console's Android vitals
 *    captures stack traces for Play-distributed builds with no SDK integration,
 *    so the app is not flying blind on the crashes that survive this handler.
 *
 * What is still missing, and is a product decision rather than a code one: a
 * crash SDK would add breadcrumbs, custom keys, non-fatal reporting, alerting
 * faster than Play's aggregation, and coverage of builds that did not come from
 * Play. Every one of those options adds a third-party dependency to a health
 * app, which is a Play data-safety declaration and a privacy-policy change, not
 * a line of Gradle. When that decision is made, this is the single place the
 * hook belongs.
 *
 * Swallowing is not free — a sync trigger that dies here stops silently, and
 * the user sees stale data rather than an error. That is the accepted cost, and
 * it is strictly better than the alternative it replaces, which was the same
 * silent stop plus the app disappearing.
 */
val backgroundFailureHandler: CoroutineExceptionHandler = CoroutineExceptionHandler { _, _ ->
    // Intentionally empty. See the class doc — this is a containment boundary,
    // not a reporting one, and the reasoning for that is deliberate rather than
    // an omission waiting to be filled in with a println.
}
