package fit.aquazero.app.core.ui.reminders

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import fit.aquazero.app.core.data.AccountRepository
import kotlinx.coroutines.flow.first

/**
 * Fires one reminder and books the next one.
 *
 * Both gates are re-checked here, not just at scheduling time. Consent can be
 * revoked, or the notification permission taken away in system settings, at any
 * point between the work being enqueued and it running — and a reminder that
 * arrives after someone switched reminders off is exactly the failure the
 * consent bit exists to prevent. When either gate is shut the worker posts
 * nothing, schedules nothing, and lets the chain die.
 */
@HiltWorker
class ReminderWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val prefsStore: ReminderPrefsStore,
    private val notifier: ReminderNotifier,
    private val scheduler: ReminderScheduler,
    private val accountRepository: AccountRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val type = inputData.getString(KEY_TYPE)
            ?.let { name -> ReminderType.entries.firstOrNull { it.name == name } }
            ?: return Result.failure()

        val consented = accountRepository.consents().first()?.reminders == true
        if (!consented || !notifier.canPostNotifications()) {
            notifier.cancelAll()
            return Result.success()
        }

        val prefs = prefsStore.current()
        if (!prefs.isEnabled(type)) return Result.success()

        notifier.notify(type)
        // Self-rescheduling rather than PeriodicWorkRequest: the weekly weigh-in
        // and the windowed hydration slots are not fixed intervals, and a
        // periodic request cannot express either.
        scheduler.scheduleOne(type, prefs)
        return Result.success()
    }

    companion object {
        /** Input key naming which [ReminderType] this run is for. */
        const val KEY_TYPE = "reminderType"
    }
}
