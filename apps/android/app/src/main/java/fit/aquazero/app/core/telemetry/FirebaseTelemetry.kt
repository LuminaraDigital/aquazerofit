package fit.aquazero.app.core.telemetry

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Crashlytics-backed [CrashReporter].
 *
 * Every string handed to Crashlytics goes through [TelemetryRedaction] first,
 * including the exception's own message — a caught `HttpException` or
 * serialization error routinely quotes the payload that broke it.
 */
@Singleton
class CrashlyticsCrashReporter @Inject constructor() : CrashReporter {

    private val crashlytics: FirebaseCrashlytics
        get() = FirebaseCrashlytics.getInstance()

    override fun log(message: String) {
        crashlytics.log(TelemetryRedaction.scrub(message))
    }

    override fun recordNonFatal(throwable: Throwable, context: Map<String, String>) {
        TelemetryRedaction.scrub(context).forEach { (key, value) ->
            crashlytics.setCustomKey(key, value)
        }
        crashlytics.recordException(RedactedThrowable.wrap(throwable))
    }

    override fun setUserId(userId: String?) {
        // Crashlytics has no "clear"; the empty string is how a session is
        // detached from an account on sign-out.
        crashlytics.setUserId(userId.orEmpty())
    }
}

/**
 * Carries a throwable's type and stack to the reporter with its message
 * scrubbed.
 *
 * Recording the original would send `message` verbatim, and that message is the
 * one string in a crash report most likely to quote user data: the body that
 * failed to decode, the URL with an id in it, the token an auth error echoed.
 * The stack trace is what makes the report useful and it is copied intact.
 */
internal class RedactedThrowable private constructor(
    private val originalType: String,
    redactedMessage: String,
    stack: Array<StackTraceElement>,
    cause: Throwable?,
) : Throwable(redactedMessage, cause) {

    init {
        stackTrace = stack
    }

    override fun toString(): String = "$originalType: $message"

    internal companion object {
        /**
         * Depth bound on the cause chain. A cycle here would recurse until the
         * stack ran out, and turning a crash report into a crash is a poor
         * trade; real chains are nowhere near this deep.
         */
        private const val MAX_CAUSE_DEPTH = 16

        fun wrap(throwable: Throwable): Throwable = wrap(throwable, depth = 0)

        private fun wrap(throwable: Throwable, depth: Int): Throwable = RedactedThrowable(
            originalType = throwable.javaClass.name,
            redactedMessage = throwable.message?.let(TelemetryRedaction::scrub).orEmpty(),
            stack = throwable.stackTrace,
            cause = throwable.cause
                ?.takeIf { depth < MAX_CAUSE_DEPTH && it !== throwable }
                ?.let { wrap(it, depth + 1) },
        )
    }
}

/** Firebase-Analytics-backed [AnalyticsTracker]. */
@Singleton
class FirebaseAnalyticsTracker @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : AnalyticsTracker {

    private val analytics: FirebaseAnalytics
        get() = FirebaseAnalytics.getInstance(context)

    override fun track(name: String, params: Map<String, String>) {
        val bundle = Bundle().apply {
            TelemetryRedaction.scrub(params).forEach { (key, value) -> putString(key, value) }
        }
        analytics.logEvent(name, bundle)
    }
}

/**
 * The consent switch over both Firebase SDKs.
 *
 * Both are started disabled by manifest `meta-data`, so nothing is collected
 * between process start and the moment consent is read. This flips them on when
 * the user has opted in, and on the way back down discards what has been
 * gathered but not yet sent: withdrawing consent is not permission for one
 * final upload.
 */
@Singleton
class FirebaseTelemetryCollection @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : TelemetryCollection {

    override fun setEnabled(enabled: Boolean) {
        val analytics = FirebaseAnalytics.getInstance(context)
        val crashlytics = FirebaseCrashlytics.getInstance()

        analytics.setAnalyticsCollectionEnabled(enabled)
        crashlytics.isCrashlyticsCollectionEnabled = enabled

        if (!enabled) {
            analytics.resetAnalyticsData()
            crashlytics.deleteUnsentReports()
        }
    }
}
