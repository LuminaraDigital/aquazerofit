package fit.aquazero.app.core.designsystem

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/** Toast flavors. */
enum class ToastKind { Success, Error, Info }

/** One queued toast. */
data class ToastData(
    val id: Long,
    val message: String,
    val kind: ToastKind,
)

/**
 * App-wide toast queue: bottom-anchored, max 3 visible, 3.8s auto-dismiss.
 * Inject and call [success]/[error]/[info]; the shell renders [ToastHost].
 */
@Singleton
class ToastController @Inject constructor() {
    private val ids = AtomicLong(0)

    /** Currently visible toasts (oldest first, capped at 3). */
    val toasts = mutableStateListOf<ToastData>()

    fun success(message: String) = push(message, ToastKind.Success)

    fun error(message: String) = push(message, ToastKind.Error)

    fun info(message: String) = push(message, ToastKind.Info)

    /** Remove one toast (auto-dismiss or tap). */
    fun dismiss(id: Long) {
        toasts.removeAll { it.id == id }
    }

    private fun push(message: String, kind: ToastKind) {
        toasts.add(ToastData(ids.incrementAndGet(), message, kind))
        while (toasts.size > MAX_VISIBLE) toasts.removeAt(0)
    }

    companion object {
        const val MAX_VISIBLE = 3
        const val AUTO_DISMISS_MS = 3800L
    }
}

/** Renders the toast stack above app content. Place once at the shell root. */
@Composable
fun ToastHost(
    controller: ToastController,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AzfSpacing.ContainerMargin, vertical = 24.dp),
        ) {
            controller.toasts.forEach { toast ->
                androidx.compose.runtime.key(toast.id) {
                    ToastRow(toast = toast, onDismiss = { controller.dismiss(toast.id) })
                }
            }
        }
    }
}

@Composable
private fun ToastRow(toast: ToastData, onDismiss: () -> Unit) {
    LaunchedEffect(toast.id) {
        delay(ToastController.AUTO_DISMISS_MS)
        onDismiss()
    }
    val accent = when (toast.kind) {
        ToastKind.Success -> LocalAzfExtended.current.secondaryFixedDim
        ToastKind.Error -> MaterialTheme.colorScheme.error
        ToastKind.Info -> LocalAzfExtended.current.primaryFixedDim
    }
    val icon = when (toast.kind) {
        ToastKind.Success -> Icons.Outlined.CheckCircle
        ToastKind.Error -> Icons.Outlined.ErrorOutline
        ToastKind.Info -> Icons.Outlined.Info
    }
    AnimatedVisibility(
        visible = true,
        enter = fadeIn() + slideInVertically { it / 2 },
        exit = fadeOut(),
    ) {
        Row(
            modifier = Modifier
                .padding(top = 8.dp)
                .fillMaxWidth()
                .clip(AzfShapes.Inner)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .border(
                    androidx.compose.foundation.BorderStroke(1.dp, accent.copy(alpha = 0.5f)),
                    AzfShapes.Inner,
                )
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = accent)
            Text(
                text = toast.message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun ToastHostPreview() {
    AzfTheme {
        val controller = ToastController().apply {
            success("Meal logged")
            info("Syncing 2 entries")
        }
        ToastHost(controller = controller)
    }
}
