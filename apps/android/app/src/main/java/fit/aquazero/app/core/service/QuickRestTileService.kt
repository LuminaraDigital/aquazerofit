package fit.aquazero.app.core.service

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi
import fit.aquazero.app.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Quick Settings Rest Timer Tile.
 *
 * Allows users to monitor ongoing rest intervals and trigger rest extensions
 * (+30s) directly from Android Quick Settings without unlocking or navigating
 * away from their current workout media / timer.
 */
@RequiresApi(Build.VERSION_CODES.N)
class QuickRestTileService : TileService() {

    private val serviceScope = CoroutineScope(Dispatchers.Main)
    private var stateJob: Job? = null

    override fun onStartListening() {
        super.onStartListening()
        stateJob?.cancel()
        stateJob = serviceScope.launch {
            WorkoutLiveService.state.collect { state ->
                updateTileState(state)
            }
        }
    }

    override fun onStopListening() {
        super.onStopListening()
        stateJob?.cancel()
    }

    /**
     * The pre-UpsideDownCake branch below calls the deprecated
     * `startActivityAndCollapse(Intent)`. That overload throws
     * `UnsupportedOperationException` only on API 34+ framework builds, and the
     * `SDK_INT` guard means it is reached solely on API 26-33, where it is the
     * only available call. Lint's `StartActivityAndCollapseDeprecated` is an
     * Error-severity issue rather than a deprecation warning, so the Kotlin
     * `@Suppress("DEPRECATION")` on the call site does not silence it — the
     * lint issue id has to be named here or the build fails on correct code.
     */
    @Suppress("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val currentState = WorkoutLiveService.state.value
        if (currentState.active && currentState.isResting) {
            // Quick action: Add +30 seconds to current rest timer
            val intent = Intent(this, WorkoutLiveService::class.java).apply {
                action = WorkoutLiveService.ACTION_ADD_REST
            }
            startService(intent)
        } else {
            // Open AquaZeroFit workout session
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val pending = android.app.PendingIntent.getActivity(
                    this,
                    0,
                    launchIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE,
                )
                startActivityAndCollapse(pending)
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(launchIntent)
            }
        }
    }

    private fun updateTileState(state: LiveWorkoutState) {
        val tile = qsTile ?: return
        if (state.active) {
            tile.state = Tile.STATE_ACTIVE
            if (state.isResting) {
                val minutes = state.restSecondsLeft / 60
                val seconds = state.restSecondsLeft % 60
                tile.label = "Rest: %02d:%02d".format(minutes, seconds)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    tile.subtitle = "+30s on tap"
                }
            } else {
                tile.label = state.exerciseName.ifBlank { "Workout Active" }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    tile.subtitle = "Set ${state.setNumber}/${state.totalSets}"
                }
            }
        } else {
            tile.state = Tile.STATE_INACTIVE
            tile.label = "AquaZero Rest"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                tile.subtitle = "Start Workout"
            }
        }
        tile.updateTile()
    }
}
