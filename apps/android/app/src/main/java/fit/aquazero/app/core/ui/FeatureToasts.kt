package fit.aquazero.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.ToastKind
import javax.inject.Inject

/**
 * How a screen shows a one-shot message.
 *
 * The feature ViewModels deliberately emit *events* carrying a string
 * resource rather than formatted text: that keeps them free of Android
 * resources and testable on the JVM, and leaves localisation to the
 * composable that renders them.
 */
fun interface ToastSink {
    /** Show [message] with the given [kind]. */
    fun show(message: String, kind: ToastKind)
}

/**
 * Hilt handle onto the app-wide `@Singleton` [ToastController], which the
 * shell already mounts once at the root (`ToastHost` in `AzfNavigation`).
 */
@HiltViewModel
class ToastHolderViewModel @Inject constructor(
    val toastController: ToastController,
) : ViewModel()

/** A [ToastSink] backed by the shell's shared toast queue. */
@Composable
fun rememberToastSink(): ToastSink {
    val holder: ToastHolderViewModel = hiltViewModel()
    return remember(holder) {
        ToastSink { message, kind ->
            when (kind) {
                ToastKind.Success -> holder.toastController.success(message)
                ToastKind.Error -> holder.toastController.error(message)
                ToastKind.Info -> holder.toastController.info(message)
            }
        }
    }
}
