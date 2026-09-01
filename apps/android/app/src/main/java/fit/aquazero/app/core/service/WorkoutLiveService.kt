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
                startForeground(NOTIFICATION_ID, buildNotification(newState))
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, WorkoutLiveService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
