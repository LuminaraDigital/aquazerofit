package fit.aquazero.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.ui.AppEntryPoint
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The app's answer to [AppEntryPoint]: notifications open [MainActivity].
 *
 * This class deliberately lives in `:app`. It is the only layer that knows
 * the entry activity exists, and naming it from anywhere lower would point a
 * shared module back at the shell.
 */
@Singleton
class MainActivityEntryPoint @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : AppEntryPoint {

    override fun openAppIntent(): PendingIntent {
        // CLEAR_TOP | SINGLE_TOP so a tapped reminder resumes the activity
        // already running instead of stacking a second copy above it.
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

/** Binds the shell's entry point to the interface shared UI declares. */
@Module
@InstallIn(SingletonComponent::class)
interface AppEntryPointBinding {

    @Binds
    @Singleton
    fun appEntryPoint(impl: MainActivityEntryPoint): AppEntryPoint
}
