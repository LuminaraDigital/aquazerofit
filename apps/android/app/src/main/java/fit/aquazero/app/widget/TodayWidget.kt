package fit.aquazero.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.Text
import fit.aquazero.app.R
import fit.aquazero.app.feature.dashboard.NutritionFormat

/**
 * "Today" — calories against target, hydration against target, and whether
 * today's session is done, with one tap that logs a glass of water.
 *
 * The retention argument for this widget is that the loop it serves is daily
 * and the app is currently the only place to close it. Everything drawn here
 * comes out of Room, so it is correct in a lift, on a plane and at 3% battery,
 * and the water tap goes through the same outbox as the in-app one rather than
 * inventing a second, less careful way to write.
 *
 * Numbers are read, never recomputed. `LocalDailyNutrition` arrives already
 * folded by `DailyNutritionCalculator` — the same flow the dashboard rings
 * collect — and every string is formatted through the dashboard's
 * [NutritionFormat], so a total shown here and the same total shown one tap
 * later are the same characters. Re-deriving either would be a second answer
 * to a question that already has one.
 */
class TodayWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val reader = TodayWidgetReader.from(context)
        provideContent {
            // Observed rather than read once: while the host keeps the
            // session alive, a meal logged inside the app moves the widget's
            // numbers without waiting for the next update tick.
            val snapshot by reader.snapshots()
                .collectAsState(initial = TodayWidgetSnapshot.Loading)
            TodayWidgetContent(snapshot)
        }
    }
}

@Composable
private fun TodayWidgetContent(snapshot: TodayWidgetSnapshot) {
    val context = LocalContext.current
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            // Tags the root so launchers on API 31+ mask the widget to their
            // own corner radius; the explicit radius covers 26–30.
            .appWidgetBackground()
            .background(WidgetTheme.Card)
            .cornerRadius(WidgetTheme.CardCorner)
            .padding(WidgetTheme.CardPadding)
            .clickable(actionStartActivity(WidgetLaunch.openApp(context)))
            .semantics { contentDescription = context.getString(R.string.widget_open_app_cd) },
    ) {
        when {
            !snapshot.loaded -> Placeholder(context.getString(R.string.widget_loading))
            !snapshot.configured -> Placeholder(context.getString(R.string.widget_setup))
            else -> {
                CaloriesBand(snapshot, context)
                Spacer(GlanceModifier.height(WidgetTheme.BandGap))
                WaterBand(snapshot, context)
            }
        }
    }
}

/**
 * The state before Room has answered, and the state when there is nothing
 * true to say — a signed-out or half-onboarded device has no targets, and
 * "0 / 0 kcal" would read as a broken app rather than an unfinished setup.
 */
@Composable
private fun Placeholder(message: String) {
    Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = message, style = WidgetTheme.Caption, maxLines = 2)
    }
}

@Composable
private fun CaloriesBand(snapshot: TodayWidgetSnapshot, context: Context) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = context.getString(
                R.string.widget_kcal_value,
                NutritionFormat.fmtInt(snapshot.kcalConsumed),
                NutritionFormat.fmtInt(snapshot.kcalTarget),
            ),
            style = WidgetTheme.Headline,
            maxLines = 1,
            modifier = GlanceModifier
                .defaultWeight()
                .semantics {
                    // "1,240 / 2,100 kcal" is a good glance and a poor listen.
                    contentDescription = context.getString(
                        R.string.dashboard_calories_cd,
                        NutritionFormat.fmtInt(snapshot.kcalConsumed),
                        NutritionFormat.fmtInt(snapshot.kcalTarget),
                    )
                },
        )
        WorkoutStatus(snapshot.workout, context)
    }
    Spacer(GlanceModifier.height(WidgetTheme.BandGap))
    LinearProgressIndicator(
        progress = snapshot.kcalFraction,
        color = WidgetTheme.Accent,
        backgroundColor = WidgetTheme.Track,
        modifier = GlanceModifier
            .fillMaxWidth()
            .height(WidgetTheme.ProgressHeight)
            .cornerRadius(WidgetTheme.ProgressHeight),
    )
}

@Composable
private fun WaterBand(snapshot: TodayWidgetSnapshot, context: Context) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = context.getString(
                R.string.hydration_litres,
                NutritionFormat.fmtLitres(snapshot.waterMl),
                NutritionFormat.fmtLitres(snapshot.waterTargetMl),
            ),
            style = WidgetTheme.Body,
            maxLines = 1,
            modifier = GlanceModifier
                .defaultWeight()
                .semantics {
                    contentDescription = context.getString(
                        R.string.hydration_droplets_cd,
                        snapshot.waterMl,
                        snapshot.waterTargetMl,
                    )
                },
        )
        LogWaterButton(context)
    }
}

/**
 * The reason the widget is worth installing: a glass of water logged without
 * a cold start. Hand-rolled from a Box rather than Glance's `Button` so the
 * fill, the label and the pill all come from [WidgetTheme] and match the app.
 */
@Composable
private fun LogWaterButton(context: Context) {
    Box(
        modifier = GlanceModifier
            .height(WidgetTheme.TouchTarget)
            .background(WidgetTheme.ActionFill)
            .cornerRadius(WidgetTheme.TouchTarget / 2)
            .padding(horizontal = WidgetTheme.ActionPadding)
            .clickable(actionRunCallback<LogWaterAction>())
            .semantics { contentDescription = context.getString(R.string.hydration_log_cd) },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = context.getString(R.string.widget_water_add),
            style = WidgetTheme.ActionLabel,
            maxLines = 1,
        )
    }
}

/**
 * Silent on [WidgetWorkoutState.UNKNOWN]. Room cannot distinguish "no plan
 * fetched on this device yet" from "today is a rest day", and inventing a
 * label for that ambiguity would put a wrong claim on the home screen.
 */
@Composable
private fun WorkoutStatus(state: WidgetWorkoutState, context: Context) {
    val label = when (state) {
        WidgetWorkoutState.UNKNOWN -> return
        WidgetWorkoutState.DONE -> R.string.widget_workout_done
        WidgetWorkoutState.PENDING -> R.string.widget_workout_pending
    }
    Text(
        text = context.getString(label),
        style = if (state == WidgetWorkoutState.DONE) WidgetTheme.CaptionPositive else WidgetTheme.Caption,
        maxLines = 1,
    )
}
