package fit.aquazero.app.feature.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import fit.aquazero.app.core.designsystem.AssetImage
import fit.aquazero.app.core.designsystem.BrandAssets
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AuthRepository
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.network.ApiResult
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Immutable UI state for the sign-in / register screen. */
data class SignInUiState(
    val registerMode: Boolean = false,
    val email: String = "",
    val password: String = "",
    val displayName: String = "",
    val loading: Boolean = false,
    val emailError: Boolean = false,
    val submitError: String? = null,
) {
    val passwordLongEnough: Boolean get() = password.length >= 8
    val passwordHasUppercase: Boolean get() = password.any { it.isUpperCase() }
    val passwordHasDigit: Boolean get() = password.any { it.isDigit() }
    val passwordValid: Boolean
        get() = passwordLongEnough && passwordHasUppercase && passwordHasDigit
    val canSubmit: Boolean
        get() = email.isNotBlank() && password.isNotBlank() &&
            (!registerMode || passwordValid) && !loading
}

/** Drives login/register against [AuthRepository]. */
@HiltViewModel
class SignInViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SignInUiState())

    /** Screen state. */
    val state: StateFlow<SignInUiState> = _state.asStateFlow()

    fun setMode(register: Boolean) = _state.update { it.copy(registerMode = register) }

    fun onEmail(value: String) =
        _state.update { it.copy(email = value, emailError = false, submitError = null) }

    fun onPassword(value: String) = _state.update { it.copy(password = value, submitError = null) }

    fun onDisplayName(value: String) = _state.update { it.copy(displayName = value) }

    fun toggleMode() =
        _state.update { it.copy(registerMode = !it.registerMode, submitError = null) }

    /** Validate and submit; on success the session flips the root nav. */
    fun submit(genericError: String, offlineError: String) {
        val s = _state.value
        if (!EMAIL_REGEX.matches(s.email.trim())) {
            _state.update { it.copy(emailError = true) }
            return
        }
        _state.update { it.copy(loading = true, submitError = null) }
        viewModelScope.launch {
            val result = if (s.registerMode) {
                authRepository.register(
                    email = s.email.trim(),
                    password = s.password,
                    displayName = s.displayName.trim().ifBlank { null },
                )
            } else {
                authRepository.login(email = s.email.trim(), password = s.password)
            }
            when (result) {
                is ApiResult.Success -> _state.update { it.copy(loading = false) }
                is ApiResult.Failure.Api -> _state.update {
                    it.copy(loading = false, submitError = result.message.ifBlank { genericError })
                }
                is ApiResult.Failure.Network -> _state.update {
                    it.copy(loading = false, submitError = offlineError)
                }
            }
        }
    }

    private companion object {
        val EMAIL_REGEX = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
    }
}

/**
 * Sign-in / registration with live validation, a password-rules checklist in
 * register mode, and API error display. Auth success is observed by the nav
 * shell via the session state — no explicit navigation call needed here.
 */
@Composable
fun SignInScreen(
    startInRegisterMode: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SignInViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(startInRegisterMode) {
        viewModel.setMode(startInRegisterMode)
    }
    val genericError = stringResource(R.string.signin_error_generic)
    val offlineError = stringResource(R.string.signin_error_offline)

    Column(
        modifier = modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        AzfAppHeader(
            title = stringResource(
                if (state.registerMode) R.string.signin_title_register else R.string.signin_title_login,
            ),
            onBack = onBack,
        )
        Column(
            modifier = Modifier.padding(horizontal = AzfSpacing.ContainerMargin),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AssetImage(
                assetPath = BrandAssets.LOGO,
                contentDescription = stringResource(R.string.welcome_logo),
                modifier = Modifier
                    .padding(vertical = 16.dp)
                    .size(56.dp)
                    .revealOnEnter(0),
            )
            AzfTextField(
                value = state.email,
                onValueChange = viewModel::onEmail,
                label = stringResource(R.string.signin_email),
                error = if (state.emailError) stringResource(R.string.signin_error_email) else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier
                    .padding(top = 8.dp)
                    .revealOnEnter(0),
            )
            AzfTextField(
                value = state.password,
                onValueChange = viewModel::onPassword,
                label = stringResource(R.string.signin_password),
                isPassword = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier
                    .padding(top = 12.dp)
                    .revealOnEnter(1),
            )
            if (state.registerMode) {
                AzfTextField(
                    value = state.displayName,
                    onValueChange = viewModel::onDisplayName,
                    label = stringResource(R.string.signin_display_name),
                    modifier = Modifier
                        .padding(top = 12.dp)
                        .revealOnEnter(2),
                )
                PasswordChecklist(state = state, modifier = Modifier.padding(top = 16.dp))
            }
            state.submitError?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
            PrimaryButton(
                text = stringResource(
                    if (state.registerMode) R.string.signin_submit_register else R.string.signin_submit_login,
                ),
                onClick = { viewModel.submit(genericError, offlineError) },
                enabled = state.canSubmit,
                loading = state.loading,
                modifier = Modifier.padding(top = 24.dp),
            )
            TextButton(
                onClick = viewModel::toggleMode,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(top = 8.dp, bottom = 24.dp),
            ) {
                Text(
                    text = stringResource(
                        if (state.registerMode) {
                            R.string.signin_switch_to_login
                        } else {
                            R.string.signin_switch_to_register
                        },
                    ),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun PasswordChecklist(state: SignInUiState, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            text = stringResource(R.string.signin_password_rules).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ChecklistRow(met = state.passwordLongEnough, label = stringResource(R.string.signin_error_password_length))
        ChecklistRow(met = state.passwordHasUppercase, label = stringResource(R.string.signin_error_password_uppercase))
        ChecklistRow(met = state.passwordHasDigit, label = stringResource(R.string.signin_error_password_digit))
    }
}

@Composable
private fun ChecklistRow(met: Boolean, label: String) {
    Row(
        modifier = Modifier.padding(top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (met) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
            contentDescription = null,
            tint = if (met) {
                LocalAzfExtended.current.secondaryFixedDim
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            },
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}
