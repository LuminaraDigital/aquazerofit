package fit.aquazero.app.feature.progress

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.EmptyState

/**
 * Wave 1 placeholder for the screen_log_weight surface. Wave 2 replaces this file's
 * contents wholesale - keep exactly one screen per file, no shared code.
 */
@Composable
fun LogWeightScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize()) {
        AzfAppHeader(title = stringResource(R.string.screen_log_weight), onBack = onBack)
        EmptyState(
            title = stringResource(R.string.wave2_title),
            message = stringResource(R.string.wave2_message),
        )
    }
}
