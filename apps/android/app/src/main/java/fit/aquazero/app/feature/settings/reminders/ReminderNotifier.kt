package fit.aquazero.app.feature.settings.reminders

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import fit.aquazero.app.MainActivity
import fit.aquazero.app.R
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Posts reminder notifications and owns their channels.
 *
 * One channel per [ReminderType]: Android's own notification settings then let
 * someone mute hydration nudges while keeping their weigh-in prompt, without
 * coming back into the app. Channels are created lazily, on the first post of
 * that lane, so a person who never enables reminders never sees four empty
 * categories in the system list.
 */
@Singleton
class ReminderNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * True when notifications can actually be delivered: the runtime
     * permission on API 33+, and the user not having blocked the app at the
     * system level on any version.
     */
    fun canPostNotifications(): Boolean =
        hasPermission() && NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** The POST_NOTIFICATIONS runtime grant (implicitly held below API 33). */
    fun hasPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Post one reminder. Silently does nothing when delivery is not permitted —
     * the caller has already decided this lane should fire, and a crash here
     * would take a background worker with it.
     */
    fun notify(type: ReminderType) {
        if (!canPostNotifications()) return
        ensureChannel(type)
        val notification = NotificationCompat.Builder(context, type.channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(type.titleRes))
            .setContentText(context.getString(type.bodyRes))
            .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(type.bodyRes)))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .build()
        runCatching {
            NotificationManagerCompat.from(context).notify(type.notificationId, notification)
        }
    }

    /** Drop any reminder already in the shade — used when consent is revoked. */
    fun cancelAll() {
        val manager = NotificationManagerCompat.from(context)
        ReminderType.entries.forEach { manager.cancel(it.notificationId) }
    }

    private fun ensureChannel(type: ReminderType) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(type.channelId) != null) return
        val channel = NotificationChannel(
            type.channelId,
            context.getString(type.channelNameRes),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.reminder_channel_description)
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    private fun openAppIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
