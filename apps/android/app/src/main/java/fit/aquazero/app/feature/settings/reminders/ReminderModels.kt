package fit.aquazero.app.feature.settings.reminders

import androidx.annotation.StringRes
import fit.aquazero.app.R
import java.time.DayOfWeek

/**
 * The four reminder lanes.
 *
 * The web client stores these in `localStorage` and never delivers anything —
 * its own banner says so. On Android they are real: one notification channel
 * each, so a person can silence hydration nudges from the system settings
 * without losing their weigh-in prompt, which is the whole point of per-type
 * channels.
 */
enum class ReminderType(
    /** Stable channel id — never renamed, or existing user choices are lost. */
    val channelId: String,
    @StringRes val channelNameRes: Int,
    @StringRes val titleRes: Int,
    @StringRes val bodyRes: Int,
    /** Distinct notification ids so one lane never replaces another. */
    val notificationId: Int,
) {
    MEALS(
        channelId = "azf_reminder_meals",
        channelNameRes = R.string.reminder_channel_meals,
        titleRes = R.string.reminder_meals_title,
        bodyRes = R.string.reminder_meals_body,
        notificationId = 4101,
    ),
    WATER(
        channelId = "azf_reminder_water",
        channelNameRes = R.string.reminder_channel_water,
        titleRes = R.string.reminder_water_title,
        bodyRes = R.string.reminder_water_body,
        notificationId = 4102,
    ),
    WORKOUT(
        channelId = "azf_reminder_workout",
        channelNameRes = R.string.reminder_channel_workout,
        titleRes = R.string.reminder_workout_title,
        bodyRes = R.string.reminder_workout_body,
        notificationId = 4103,
    ),
    WEIGH_IN(
        channelId = "azf_reminder_weigh_in",
        channelNameRes = R.string.reminder_channel_weigh_in,
        titleRes = R.string.reminder_weigh_in_title,
        bodyRes = R.string.reminder_weigh_in_body,
        notificationId = 4104,
    ),
    ;

    /** Unique WorkManager name, so re-scheduling replaces rather than stacks. */
    val workName: String get() = "azf_reminder_${name.lowercase()}"
}

/** How often the hydration nudge repeats through the waking window. */
enum class WaterFrequency(val hours: Int) {
    EVERY_1H(1),
    EVERY_2H(2),
    EVERY_4H(4),
    ;

    companion object {
        fun fromHours(hours: Int): WaterFrequency =
            entries.firstOrNull { it.hours == hours } ?: EVERY_2H
    }
}

/** A time of day, stored as two integers so no locale parsing is involved. */
data class TimeOfDay(val hour: Int, val minute: Int) {
    init {
        require(hour in 0..23) { "hour out of range: $hour" }
        require(minute in 0..59) { "minute out of range: $minute" }
    }

    /** Zero-padded 24h label; the screen formats it for display separately. */
    fun toIso(): String = "%02d:%02d".format(hour, minute)

    companion object {
        /** Parse `HH:mm`, falling back to [fallback] on anything unexpected. */
        fun parse(raw: String?, fallback: TimeOfDay): TimeOfDay {
            val parts = raw?.split(':') ?: return fallback
            if (parts.size != 2) return fallback
            val hour = parts[0].toIntOrNull() ?: return fallback
            val minute = parts[1].toIntOrNull() ?: return fallback
            if (hour !in 0..23 || minute !in 0..59) return fallback
            return TimeOfDay(hour, minute)
        }
    }
}

/**
 * Every reminder preference, device-local.
 *
 * The master switch is deliberately NOT here: it is the `reminders` consent bit
 * on the account, so turning it off travels with the account rather than with
 * the handset.
 */
data class ReminderPrefs(
    val mealsEnabled: Boolean = true,
    val mealsTime: TimeOfDay = TimeOfDay(8, 30),
    val waterEnabled: Boolean = true,
    val waterFrequency: WaterFrequency = WaterFrequency.EVERY_2H,
    val workoutEnabled: Boolean = true,
    val workoutTime: TimeOfDay = TimeOfDay(17, 0),
    val weighInEnabled: Boolean = false,
    val weighInDay: DayOfWeek = DayOfWeek.MONDAY,
    val weighInTime: TimeOfDay = TimeOfDay(8, 0),
) {

    /** True when this lane should be scheduled, ignoring consent/permission. */
    fun isEnabled(type: ReminderType): Boolean = when (type) {
        ReminderType.MEALS -> mealsEnabled
        ReminderType.WATER -> waterEnabled
        ReminderType.WORKOUT -> workoutEnabled
        ReminderType.WEIGH_IN -> weighInEnabled
    }

    companion object {
        /**
         * Hydration nudges only fire inside waking hours. A reminder to drink
         * water at 03:00 is not a reminder, it is a wake-up call.
         */
        const val WATER_WINDOW_START_HOUR = 8
        const val WATER_WINDOW_END_HOUR = 21
    }
}
