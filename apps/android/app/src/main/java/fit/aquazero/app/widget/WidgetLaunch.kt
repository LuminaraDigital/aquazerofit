package fit.aquazero.app.widget

import android.content.Context
import android.content.Intent

/**
 * Where a tap on the widget body goes.
 *
 * `core.ui.AppEntryPoint` is the SPI for exactly this question, and it is the
 * right one for notifications, but it cannot be used from Glance: it hands
 * back a `PendingIntent`, and Glance's action vocabulary
 * (`actionStartActivity`, `actionRunCallback`, `actionSendBroadcast`) has no
 * member that takes one. The only way to spend a `PendingIntent` here would be
 * to call `send()` ourselves from inside an `ActionCallback` — which runs in a
 * broadcast receiver, in the background, and is therefore a background
 * activity launch that the platform blocks. The widget's primary interaction
 * is not somewhere to gamble on a BAL exemption.
 *
 * So the destination is resolved the way the launcher resolves it: ask the
 * package manager for this package's declared entry point. That keeps the
 * property `AppEntryPoint` exists to protect — nothing below `:app` names
 * `MainActivity` — without a `PendingIntent` in the middle, and it is one
 * `Intent`-returning method away from being folded back into the SPI if that
 * interface ever grows one.
 */
internal object WidgetLaunch {

    /** An intent that resumes the app rather than stacking a second copy of it. */
    fun openApp(context: Context): Intent {
        val launcher = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: fallbackLauncherIntent(context)
        // Same flags as the notification path: a widget tapped twice should
        // resume the running task, not leave two of the app on the back stack.
        return launcher.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP,
        )
    }

    /**
     * `getLaunchIntentForPackage` returns null when the package manager cannot
     * see a launcher activity for us — which happens transiently while the app
     * is being updated. Re-stating the query as a plain intent is better than
     * a widget whose tap silently does nothing during an update.
     */
    private fun fallbackLauncherIntent(context: Context): Intent =
        Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(context.packageName)
}
