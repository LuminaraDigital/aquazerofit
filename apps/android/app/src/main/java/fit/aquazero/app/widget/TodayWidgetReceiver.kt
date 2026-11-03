package fit.aquazero.app.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * The `AppWidgetProvider` the system talks to.
 *
 * Deliberately nothing but the shell — the same division `SyncWorker` makes
 * against `OutboxDrainer`. It cannot be Hilt-injected (the framework
 * constructs it), which is why [TodayWidgetReader] reaches the graph through
 * an entry point instead; keeping this class empty means there is nothing here
 * that would want injecting in the first place.
 */
class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}
