package fit.aquazero.app.widget

import android.content.Context
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.telemetry.CrashReporter
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.time.Clock

/**
 * The graph objects the widget needs, reachable from a component Hilt cannot
 * inject into.
 *
 * `GlanceAppWidget` and `ActionCallback` are both instantiated by the system
 * — the receiver by `AppWidgetManager`, the callback by Glance's own
 * broadcast receiver — so neither has a constructor Hilt can own. This is the
 * same problem `SyncWorker` has and the same shape of answer: the framework
 * builds the shell, and the shell asks the graph for what it needs.
 * `SyncWorker` can use `@HiltWorker` because WorkManager has a pluggable
 * factory; app widgets have no such hook, so the lookup is explicit.
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun logsRepository(): LogsRepository
    fun plansRepository(): PlansRepository
    fun crashReporter(): CrashReporter
}

/**
 * The widget's whole data layer: two Room-backed reads and one offline write.
 *
 * Deliberately no network. A widget is redrawn on the launcher's schedule,
 * often while the device is dozing and usually while the app is not running,
 * so a fetch here would be a request nobody is waiting for that fails more
 * often than it succeeds. Everything shown comes out of the same Room cache
 * the dashboard reads, which is exactly why it is correct offline.
 */
internal class TodayWidgetReader(
    private val logsRepository: LogsRepository,
    private val plansRepository: PlansRepository,
    private val crashReporter: CrashReporter,
    private val clock: Clock = Clock.systemDefaultZone(),
) {

    /**
     * Today's day, folded from the same two sources the dashboard uses.
     *
     * The day string is resolved when the flow is built rather than cached on
     * this object, for the reason `DashboardViewModel` documents at length: a
     * widget session outlives midnight, and a session still keyed on yesterday
     * would draw yesterday's totals under today's date. A Glance session is
     * recreated on every host update, so each update re-reads the wall clock.
     */
    fun snapshots(): Flow<TodayWidgetSnapshot> {
        val localDate = LocalDates.today(clock)
        return combine(
            logsRepository.localDailyNutrition(localDate),
            plansRepository.sessionForDate(localDate),
        ) { nutrition, session -> TodayWidgetSnapshot.of(nutrition, session?.status) }
    }

    /**
     * Add [amountMl] to today's hydration through the ordinary offline path.
     *
     * `LogsRepository.logWater` writes Room, enqueues an outbox CREATE with a
     * fresh idempotency key and asks the scheduler for a drain — so a tap made
     * in a tunnel is indistinguishable from one made in the app, and the
     * replay safety the outbox already guarantees covers the widget for free.
     * There is no second write path here and there must never be one.
     *
     * Failures are recorded rather than thrown. The dashboard answers a
     * failed local write with a toast and a rollback; a widget has no toast
     * and no state to roll back, and letting the exception escape would take
     * the process down from inside a broadcast receiver. So the tap is lost,
     * quietly for the user and loudly for us.
     */
    suspend fun logWater(amountMl: Int) {
        runCatching { logsRepository.logWater(amountMl, LocalDates.today(clock)) }
            .onFailure { crashReporter.recordNonFatal(it, mapOf("source" to "widget_log_water")) }
    }

    companion object {
        fun from(context: Context): TodayWidgetReader {
            val entryPoint = EntryPointAccessors.fromApplication(
                context.applicationContext,
                WidgetEntryPoint::class.java,
            )
            return TodayWidgetReader(
                logsRepository = entryPoint.logsRepository(),
                plansRepository = entryPoint.plansRepository(),
                crashReporter = entryPoint.crashReporter(),
            )
        }
    }
}
