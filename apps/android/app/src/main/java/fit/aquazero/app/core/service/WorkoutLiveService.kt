package fit.aquazero.app.core.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import fit.aquazero.app.MainActivity
import fit.aquazero.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * State representing an active workout session for the ongoing notification.
 */
data class LiveWorkoutState(
    val sessionId: String = "",
    val exerciseName: String = "",
    val setNumber: Int = 1,
    val totalSets: Int = 1,
    val isResting: Boolean = false,
    val restSecondsLeft: Int = 0,
    val restTotalSeconds: Int = 0,
    val targetReps: Int = 0,
    val targetWeightKg: Double = 0.0,
    val active: Boolean = false,
)

/**
 * Android Foreground Service hosting the live workout session & rest timer (beating Hevy/Strong).
 *
 * Allows users to view real-time rest timers and trigger quick actions (+30s, skip)
 * directly from the lock screen and notification shade without unlocking their device.
 *
 * Runs as a `health`-typed foreground service, which the platform only grants
 * to callers holding one of its prerequisite permissions — see the service
 * block in AndroidManifest.xml. The notification is therefore best-effort: when
 * the promotion is refused, [update] still publishes to [state] in-process and
 * the workout carries on in the app; only the lock-screen surface is lost.
 *
 * [state] currently has no collector. It was read by a Quick Settings tile that
 * was never declared in the manifest and so could never be surfaced; the tile
 * has been deleted. The flow is kept because it is the whole point of the
 * `notificationUnavailable` fallback branch in [update] — the in-process mirror
 * a future lock-screen-less surface reads — and because deleting it would take
 * that branch with it.
 */
class WorkoutLiveService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_OR_UPDATE -> {
                val sessionId = intent.getStringExtra(EXTRA_SESSION_ID) ?: ""
                val exerciseName = intent.getStringExtra(EXTRA_EXERCISE_NAME) ?: "Workout Session"
                val setNumber = intent.getIntExtra(EXTRA_SET_NUMBER, 1)
                val totalSets = intent.getIntExtra(EXTRA_TOTAL_SETS, 1)
                val isResting = intent.getBooleanExtra(EXTRA_IS_RESTING, false)
                val restSecondsLeft = intent.getIntExtra(EXTRA_REST_LEFT, 0)
                val restTotalSeconds = intent.getIntExtra(EXTRA_REST_TOTAL, 0)
                val targetReps = intent.getIntExtra(EXTRA_TARGET_REPS, 0)
                val targetWeightKg = intent.getDoubleExtra(EXTRA_TARGET_WEIGHT, 0.0)

                val newState = LiveWorkoutState(
                    sessionId = sessionId,
                    exerciseName = exerciseName,
                    setNumber = setNumber,
                    totalSets = totalSets,
                    isResting = isResting,
                    restSecondsLeft = restSecondsLeft,
                    restTotalSeconds = restTotalSeconds,
                    targetReps = targetReps,
                    targetWeightKg = targetWeightKg,
                    active = true,
                )
                _state.value = newState
                if (!promoteToForeground(newState)) return START_NOT_STICKY
            }
            ACTION_ADD_REST -> {
                _actionEvents.value = LiveWorkoutAction.AddRest(30)
            }
            ACTION_SKIP_REST -> {
                _actionEvents.value = LiveWorkoutAction.SkipRest
            }
            ACTION_STOP -> {
                _state.value = LiveWorkoutState(active = false)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    /**
     * Go foreground, or give up on the notification without taking the workout
     * down with it.
     *
     * The `health` service type has permission prerequisites (see the service
     * block in AndroidManifest.xml); missing them makes `startForeground`
     * throw SecurityException on API 34+. API 31+ can also refuse the
     * promotion outright with ForegroundServiceStartNotAllowedException, an
     * IllegalStateException, when the process was in the background at start.
     *
     * Either way the service MUST stop immediately: the system kills a process
     * that called `startForegroundService` and then did not post a foreground
     * notification. [_state] is left intact, so the session screen and the
     * quick-settings tile keep reading the live rest countdown from memory —
     * everything except the lock-screen surface survives.
     *
     * Returns false when the caller should treat the service as stopped.
     */
    private fun promoteToForeground(state: LiveWorkoutState): Boolean = try {
        startForeground(NOTIFICATION_ID, buildNotification(state))
        true
    } catch (e: SecurityException) {
        giveUpOnNotification(e)
        false
    } catch (e: IllegalStateException) {
        giveUpOnNotification(e)
        false
    }

    private fun giveUpOnNotification(cause: Exception) {
        Log.w(TAG, "Live workout notification unavailable; session continues in-app.", cause)
        notificationUnavailable = true
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Active Workout Session",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shows live rest countdown and active set details during workouts."
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(state: LiveWorkoutState): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val title = "${state.exerciseName} · Set ${state.setNumber}/${state.totalSets}"
        val contentText = if (state.isResting) {
            val minutes = state.restSecondsLeft / 60
            val seconds = state.restSecondsLeft % 60
            "Resting: %02d:%02d remaining".format(minutes, seconds)
        } else {
            if (state.targetWeightKg > 0.0) {
                "Target: %d reps @ %.1f kg".format(state.targetReps, state.targetWeightKg)
            } else {
                "Target: %d reps".format(state.targetReps)
            }
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(contentText)
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (state.isResting) {
            val addRestIntent = Intent(this, WorkoutLiveService::class.java).apply {
                action = ACTION_ADD_REST
            }
            val addRestPending = PendingIntent.getService(
                this,
                1,
                addRestIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            builder.addAction(0, "+30s Rest", addRestPending)

            val skipRestIntent = Intent(this, WorkoutLiveService::class.java).apply {
                action = ACTION_SKIP_REST
            }
            val skipRestPending = PendingIntent.getService(
                this,
                2,
                skipRestIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            builder.addAction(0, "Skip Rest", skipRestPending)
        }

        return builder.build()
    }

    sealed interface LiveWorkoutAction {
        data class AddRest(val seconds: Int) : LiveWorkoutAction
        data object SkipRest : LiveWorkoutAction
    }

    companion object {
        private const val TAG = "WorkoutLiveService"

        const val CHANNEL_ID = "workout_live_channel"
        const val NOTIFICATION_ID = 4001

        const val ACTION_START_OR_UPDATE = "fit.aquazero.app.WORKOUT_LIVE_UPDATE"
        const val ACTION_ADD_REST = "fit.aquazero.app.WORKOUT_LIVE_ADD_REST"
        const val ACTION_SKIP_REST = "fit.aquazero.app.WORKOUT_LIVE_SKIP_REST"
        const val ACTION_STOP = "fit.aquazero.app.WORKOUT_LIVE_STOP"

        const val EXTRA_SESSION_ID = "extra_session_id"
        const val EXTRA_EXERCISE_NAME = "extra_exercise_name"
        const val EXTRA_SET_NUMBER = "extra_set_number"
        const val EXTRA_TOTAL_SETS = "extra_total_sets"
        const val EXTRA_IS_RESTING = "extra_is_resting"
        const val EXTRA_REST_LEFT = "extra_rest_left"
        const val EXTRA_REST_TOTAL = "extra_rest_total"
        const val EXTRA_TARGET_REPS = "extra_target_reps"
        const val EXTRA_TARGET_WEIGHT = "extra_target_weight"

        private val _state = MutableStateFlow(LiveWorkoutState())
        val state: StateFlow<LiveWorkoutState> = _state.asStateFlow()

        private val _actionEvents = MutableStateFlow<LiveWorkoutAction?>(null)
        val actionEvents: StateFlow<LiveWorkoutAction?> = _actionEvents.asStateFlow()

        /**
         * Latched once the system has refused to let this service go
         * foreground, so [update] stops re-attempting it.
         *
         * Without the latch the rest countdown — which syncs once a second —
         * would start, fail and stop the service every tick for the rest of
         * the session. [stop] clears it, so the next workout tries again: by
         * then the user may have granted the permission in Settings.
         */
        @Volatile
        private var notificationUnavailable = false

        fun resetAction() {
            _actionEvents.value = null
        }

        fun update(
            context: Context,
            sessionId: String,
            exerciseName: String,
            setNumber: Int,
            totalSets: Int,
            isResting: Boolean,
            restSecondsLeft: Int,
            restTotalSeconds: Int,
            targetReps: Int,
            targetWeightKg: Double,
        ) {
            // The in-app session is the source of truth; the notification is a
            // mirror of it. Once the system has refused the promotion, publish
            // the state in-process and skip the service entirely.
            if (notificationUnavailable) {
                _state.value = LiveWorkoutState(
                    sessionId = sessionId,
                    exerciseName = exerciseName,
                    setNumber = setNumber,
                    totalSets = totalSets,
                    isResting = isResting,
                    restSecondsLeft = restSecondsLeft,
                    restTotalSeconds = restTotalSeconds,
                    targetReps = targetReps,
                    targetWeightKg = targetWeightKg,
                    active = true,
                )
                return
            }
            val intent = Intent(context, WorkoutLiveService::class.java).apply {
                action = ACTION_START_OR_UPDATE
                putExtra(EXTRA_SESSION_ID, sessionId)
                putExtra(EXTRA_EXERCISE_NAME, exerciseName)
                putExtra(EXTRA_SET_NUMBER, setNumber)
                putExtra(EXTRA_TOTAL_SETS, totalSets)
                putExtra(EXTRA_IS_RESTING, isResting)
                putExtra(EXTRA_REST_LEFT, restSecondsLeft)
                putExtra(EXTRA_REST_TOTAL, restTotalSeconds)
                putExtra(EXTRA_TARGET_REPS, targetReps)
                putExtra(EXTRA_TARGET_WEIGHT, targetWeightKg)
            }
            // Start can be refused before the service ever runs: API 31+
            // throws ForegroundServiceStartNotAllowedException when the
            // process has no right to start one from the background, and API
            // 34+ throws SecurityException when the `health` prerequisites are
            // missing. Neither is worth a crash mid-set.
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "Could not start the live workout service.", e)
                notificationUnavailable = true
            } catch (e: IllegalStateException) {
                Log.w(TAG, "Could not start the live workout service.", e)
                notificationUnavailable = true
            }
        }

        fun stop(context: Context) {
            // Clears the latch too: a session that could not show a
            // notification should not condemn the next one to the same.
            notificationUnavailable = false
            val intent = Intent(context, WorkoutLiveService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.startService(intent)
            } catch (e: IllegalStateException) {
                // Backgrounded before the session was torn down; the service
                // is already gone, and _state is reset here instead.
                Log.w(TAG, "Could not stop the live workout service.", e)
                _state.value = LiveWorkoutState(active = false)
            }
        }
    }
}
