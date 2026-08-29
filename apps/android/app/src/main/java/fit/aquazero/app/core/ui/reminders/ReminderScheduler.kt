package fit.aquazero.app.core.ui.reminders

import android.content.Context
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Books and cancels the local reminder chain.
 *
 * Each lane is a uniquely-named one-off that re-enqueues itself after firing
 * (see [ReminderWorker]). `REPLACE` on the unique name means changing a time
 * moves the pending reminder instead of stacking a second one.
 *
 * Nothing here asks for an exact alarm: the app holds no `SCHEDULE_EXACT_ALARM`
 * permission (plan §1), so WorkManager may run a reminder somewhat after its
 * slot. That is a deliberate trade — a nudge is not an alarm clock — and the
 * screen's copy says "around" rather than promising the minute.
 *
 * Shared, not owned by Settings: [sync] is the call that makes the `reminders`
 * consent real, and consent is answered on the setup form as well as on the
 * notification screen. Both callers reach the same scheduler from here instead
 * of one feature reaching into another.
 */
@Singleton
class ReminderScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val notifier: ReminderNotifier,
) {

    private val workManager: WorkManager get() = WorkManager.getInstance(context)

    /**
     * Bring the schedule in line with the current position.
     *
     * [remindersConsented] is the account-level `reminders` consent bit and
     * [canPostNotifications] the runtime permission: **both** must hold, or
     * every lane is cancelled and anything already showing is dismissed. This
     * is what makes the consent genuinely gate behaviour rather than merely
     * grey out a switch.
     */
    fun sync(
        prefs: ReminderPrefs,
        remindersConsented: Boolean,
        canPostNotifications: Boolean = notifier.canPostNotifications(),
    ) {
        if (!remindersConsented || !canPostNotifications) {
            cancelAll()
            return
        }
        ReminderType.entries.forEach { type ->
            if (prefs.isEnabled(type)) scheduleOne(type, prefs) else cancel(type)
        }
    }

    /** Book the next occurrence of one lane. */
    fun scheduleOne(type: ReminderType, prefs: ReminderPrefs) {
        val delay = ReminderSchedule.until(type, prefs).toMillis().coerceAtLeast(0L)
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString(ReminderWorker.KEY_TYPE, type.name).build())
            .addTag(WORK_TAG)
            .build()
        workManager.enqueueUniqueWork(type.workName, ExistingWorkPolicy.REPLACE, request)
    }

    /** Cancel one lane. */
    fun cancel(type: ReminderType) {
        workManager.cancelUniqueWork(type.workName)
    }

    /** Cancel every lane and clear anything already posted. */
    fun cancelAll() {
        ReminderType.entries.forEach { cancel(it) }
        notifier.cancelAll()
    }

    private companion object {
        const val WORK_TAG = "azf_reminders"
    }
}
