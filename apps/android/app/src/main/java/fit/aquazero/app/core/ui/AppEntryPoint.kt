package fit.aquazero.app.core.ui

import android.app.PendingIntent

/**
 * What shared UI needs from the application shell, expressed as an interface
 * the shared layer owns.
 *
 * [fit.aquazero.app.core.ui.reminders.ReminderNotifier] has to give every
 * notification somewhere to go when it is tapped, and the only somewhere is
 * the app's entry activity — which lives in `:app`, above everything here.
 * Reaching up for it directly reads as harmless while the build is one module
 * and becomes an unbuildable `:core:ui -> :app` cycle the moment it is not.
 *
 * So the shell supplies the destination and the shared layer only asks for
 * one. This is the same shape as `core.network.TokenRefresher`, and for the
 * same reason: the dependency runs one way, downward, and the module that
 * knows the concrete type does the binding.
 */
interface AppEntryPoint {

    /**
     * A [PendingIntent] that opens the app, for use as a notification's
     * content intent.
     *
     * Implementations must return an intent that resumes the existing task
     * rather than stacking a second copy of the entry activity — a reminder
     * tapped twice should not leave two of the app on the back stack.
     */
    fun openAppIntent(): PendingIntent
}
