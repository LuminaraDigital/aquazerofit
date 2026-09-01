package fit.aquazero.app.core.health

import android.os.RemoteException
import kotlinx.coroutines.CancellationException
import java.io.IOException

/**
 * Run a Health Connect call and map every platform failure onto null.
 *
 * The same idea as `core/network/safeCall`, with one difference that matters:
 * `safeCall` produces a failure value the caller can show, and this produces
 * nothing at all. That is deliberate. There is no honest way to tell a user
 * why a health read failed without naming which reading it was, and this app
 * treats health figures as decoration on screens that must work without them —
 * so the only correct behaviour is to render a dash and move on.
 *
 * **Nothing here is reported.** No breadcrumb, no non-fatal, no analytics
 * event. A crash report that records "sleep read threw" reveals that the user
 * connected a sleep source, which is health information about a named
 * installation; the diagnostic value of knowing that does not come close to
 * justifying it. That absence is the design, not an oversight — see
 * `core/telemetry/Telemetry.kt` for what the app is allowed to know about
 * itself.
 */
internal suspend fun <T> healthCall(block: suspend () -> T): T? = try {
    block()
} catch (_: SecurityException) {
    // The permission was revoked in Health Connect's own settings, possibly
    // while this app sat in the background. Normal, and not an error state.
    null
} catch (e: IllegalStateException) {
    // Health Connect raises this when the provider disappears mid-session.
    // CancellationException extends IllegalStateException, though: swallowing
    // it would make a cancelled scope look like a phone without Health
    // Connect and leave structured concurrency waiting on a job already told
    // to stop.
    if (e is CancellationException) throw e
    null
} catch (_: RemoteException) {
    // The provider process died during the IPC.
    null
} catch (_: IOException) {
    // Local storage failure inside the provider.
    null
}
