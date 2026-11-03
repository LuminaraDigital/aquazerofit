package fit.aquazero.app

import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.edit
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import kotlinx.coroutines.delay

internal const val INTRO_PREFS = "azf_intro"
internal const val INTRO_KEY_SEEN = "seen_v1"
private const val START_TIMEOUT_MS = 4_000L
private const val VIDEO_ASPECT = 9f / 16f

/**
 * First-launch brand intro, shown once per install over the app shell: a
 * 14-second silent montage that ends on the wordmark (res/raw/intro.mp4, the
 * same 9:16 cut the web and Telegram front door play). Skippable at any point,
 * skipped entirely under reduced motion, and abandoned if the player has not
 * started within a few seconds so it can never hold the app hostage.
 *
 * Plain SharedPreferences rather than DataStore: the read has to be
 * synchronous so a returning user never sees a single frame of it.
 */
@Composable
fun IntroVideo() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(INTRO_PREFS, Context.MODE_PRIVATE) }
    val reducedMotion = rememberReducedMotion()
    var visible by remember { mutableStateOf(!reducedMotion && !prefs.getBoolean(INTRO_KEY_SEEN, false)) }
    var started by remember { mutableStateOf(false) }

    fun close() {
        prefs.edit { putBoolean(INTRO_KEY_SEEN, true) }
        visible = false
    }

    BackHandler(enabled = visible, onBack = ::close)

    LaunchedEffect(visible, started) {
        if (visible && !started) {
            delay(START_TIMEOUT_MS)
            close()
        }
    }

    AnimatedVisibility(visible = visible, exit = fadeOut(tween(300))) {
        BoxWithConstraints(Modifier.fillMaxSize().background(Color.White), contentAlignment = Alignment.Center) {
            // Cover, not fit: size the view to the video's aspect at whichever
            // dimension overflows, and let the screen clip the excess.
            val scale = maxOf(maxWidth.value / VIDEO_ASPECT, maxHeight.value)
            AndroidView(
                modifier = Modifier.requiredSize((scale * VIDEO_ASPECT).dp, scale.dp),
                factory = { ctx ->
                    VideoView(ctx).apply {
                        // Silent video: never pause whatever the user is listening to.
                        setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE)
                        setVideoURI(Uri.parse("android.resource://${ctx.packageName}/${R.raw.intro}"))
                        setOnPreparedListener {
                            started = true
                            start()
                        }
                        setOnCompletionListener { close() }
                        setOnErrorListener { _, _, _ ->
                            close()
                            true
                        }
                    }
                },
                onRelease = { it.stopPlayback() },
            )
            // Loading state: the mark on the same white the video fades in
            // from, drawn above the video's surface until the first frame.
            if (!started) {
                Image(
                    painter = painterResource(R.drawable.intro_logo),
                    contentDescription = null,
                    modifier = Modifier.size(96.dp),
                )
            }
            TextButton(
                onClick = ::close,
                shape = CircleShape,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(16.dp)
                    .background(Color.Black.copy(alpha = 0.55f), CircleShape),
            ) {
                Text(stringResource(R.string.intro_skip), color = Color.White)
            }
        }
    }
}
