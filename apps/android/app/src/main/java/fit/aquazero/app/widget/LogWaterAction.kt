package fit.aquazero.app.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.updateAll
import fit.aquazero.app.feature.dashboard.DashboardViewModel

/**
 * The widget's one-tap hydration write.
 *
 * The increment is taken from [DashboardViewModel.WATER_INCREMENT_ML] rather
 * than restated: it is a product decision ("a glass"), it is already spelled
 * out in the strings the user reads, and two copies of it would eventually
 * disagree about what one tap means. It is a compile-time constant, so this
 * import costs nothing at runtime and creates no cycle — the dashboard has no
 * reason to ever look at the widget.
 *
 * [updateAll] is called explicitly rather than relied upon: the composition
 * does observe Room, but only while a Glance session is alive, and after a tap
 * on a widget belonging to a process that is otherwise idle there may not be
 * one. This is the difference between the number moving under the user's
 * finger and moving half an hour later.
 */
class LogWaterAction : ActionCallback {

    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters,
    ) {
        TodayWidgetReader.from(context).logWater(DashboardViewModel.WATER_INCREMENT_ML)
        TodayWidget().updateAll(context)
    }
}
