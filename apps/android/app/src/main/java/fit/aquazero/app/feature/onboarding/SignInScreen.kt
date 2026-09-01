package fit.aquazero.app.feature.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.AlertDialog
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
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.BuildConfig
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AuthRepository
import fit.aquazero.app.core.designsystem.AssetImage
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.BrandAssets
import fit.aquazero.app.core.designsystem.CAPTCHA_ACTION_PASSWORD_RESET
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.TurnstileChallenge
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.TurnstileOutcome
import fit.aquazero.app.core.telemetry.CrashReporter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Copy the view model needs but cannot resolve: it has no `Context`, and the
 * error it shows depends on which way an attempt failed. Resolved once in the
 * composable and handed down, the way [SignInViewModel.submit] already took
 * its two messages before the challenge added three more.
 */
data class SignInMessages(
    val generic: String,
    val offline: String,
    val challengeUnavailable: String,
    val challengeFailed: String,
    val challengeCancelled: String,
)

/**
 * Minimum password length, mirroring `passwordSchema.min(12)` in
 * `packages/shared/src/schemas.ts`.
 *
 * Duplicated rather than derived because the Android app does not consume the
 * shared package — so when that schema changes, this changes with it, and
 * `PasswordPolicyTest` is what catches the day it does not.
 */
private const val MIN_PASSWORD_LENGTH = 12

/** Immutable UI state for the sign-in / register screen. */
data class SignInUiState(
    val registerMode: Boolean = false,
    val email: String = "",
    val password: String = "",
    val displayName: String = "",
    val loading: Boolean = false,
    val emailError: Boolean = false,
    val submitError: String? = null,
    /**
     * Non-null while the bot-protection challenge is on screen. Holds the
     * action name the server audits the attempt under.
     */
    val challengeAction: String? = null,
    /**
     * True once a reset mail has been requested. Shown for any well-formed
     * address, whether or not an account exists — the screen must not become
     * an oracle for which emails are registered.
     */
    val resetSent: Boolean = false,
) {
    /**
     * These four must mirror `passwordSchema` in `packages/shared`
     * (min 12, lower, upper, digit) exactly.
     *
     * They did not: this asked for 8 characters and never checked for a
     * lowercase letter, while the server asked for 12 and did. So `PASSWORD1`
     * ticked every box on screen, enabled Register, and came back a 400 —
     * with the checklist still showing all-green, which reads as the server
     * being broken rather than the password being short. A client rule that
     * is looser than the server's is not a convenience, it is a dead end the
     * user cannot debug.
     */
    val passwordLongEnough: Boolean get() = password.length >= MIN_PASSWORD_LENGTH
    val passwordHasLowercase: Boolean get() = password.any { it.isLowerCase() }
    val passwordHasUppercase: Boolean get() = password.any { it.isUpperCase() }
    val passwordHasDigit: Boolean get() = password.any { it.isDigit() }
    val passwordValid: Boolean
        get() = passwordLongEnough &&
            passwordHasLowercase &&
            passwordHasUppercase &&
            passwordHasDigit
    val canSubmit: Boolean
        get() = email.isNotBlank() &&
            password.isNotBlank() &&
            (!registerMode || passwordValid) &&
            !loading
}

/** Drives login/register against [AuthRepository]. */
@HiltViewModel
class SignInViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val crashReporter: CrashReporter,
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

    /**
     * Validate and submit; on success the session flips the root nav.
     *
     * Registration is bot-gated server-side, so it takes a detour: ask whether
     * a challenge is required, and only then either register straight away or
     * raise the challenge sheet. Sign-in is deliberately NOT challenged (the
     * per-email lockout and the /auth rate lane cover it), so it goes direct.
     *
     * `loading` stays true across the challenge. The button is the thing the
     * user pressed, and it should not spring back to life underneath a sheet.
     */
    fun submit(messages: SignInMessages) {
        val s = _state.value
        if (!EMAIL_REGEX.matches(s.email.trim())) {
            _state.update { it.copy(emailError = true) }
            return
        }
        _state.update { it.copy(loading = true, submitError = null) }
        if (!s.registerMode) {
            viewModelScope.launch {
                finish(authRepository.login(email = s.email.trim(), password = s.password), messages)
            }
            return
        }
        viewModelScope.launch {
            runStep(registerStepFor(authRepository.captchaRequirement(), messages), messages)
        }
    }

    /**
     * Ask for a reset mail.
     *
     * Bot-gated exactly like registration, so it takes the same detour. An
     * Android-only user who forgets their password previously had no route at
     * all — the repository method and the `password-reset` action name both
     * already existed, with nothing calling them.
     */
    fun requestPasswordReset(messages: SignInMessages) {
        val s = _state.value
        if (!EMAIL_REGEX.matches(s.email.trim())) {
            _state.update { it.copy(emailError = true) }
            return
        }
        _state.update { it.copy(loading = true, submitError = null, resetSent = false) }
        viewModelScope.launch {
            runStep(passwordResetStepFor(authRepository.captchaRequirement(), messages), messages)
        }
    }

    /** Dismiss the reset confirmation and return to the form. */
    fun dismissResetSent() = _state.update { it.copy(resetSent = false) }

    /** Terminal result of the challenge sheet. Exactly one of these arrives. */
    fun onChallengeResult(outcome: TurnstileOutcome, messages: SignInMessages) {
        // Captured before the clear: the action name is what tells us which
        // flow raised the sheet, and both funnel back through the same
        // Submit step.
        val action = _state.value.challengeAction
        _state.update { it.copy(challengeAction = null) }
        viewModelScope.launch { runStep(challengeStepFor(outcome, messages), messages, action) }
    }

    private suspend fun runStep(
        step: SignInStep,
        messages: SignInMessages,
        action: String? = _state.value.challengeAction,
    ) {
        when (step) {
            is SignInStep.Submit ->
                if (action == CAPTCHA_ACTION_PASSWORD_RESET) {
                    sendResetMail(step.captchaToken, messages)
                } else {
                    register(step.captchaToken, messages)
                }
            is SignInStep.Challenge -> _state.update { it.copy(challengeAction = step.action) }
            is SignInStep.Abort -> _state.update {
                it.copy(loading = false, submitError = step.message)
            }
        }
    }

    /**
     * A 4xx here is reported as success on purpose.
     *
     * The server answers the same way for a known and an unknown address, and
     * surfacing a difference the transport happened to expose would hand an
     * attacker an account-enumeration oracle on the one screen that is
     * reachable without signing in. Only a transport failure is worth telling
     * the user about, because only that means no mail was sent.
     */
    private suspend fun sendResetMail(captchaToken: String?, messages: SignInMessages) {
        val email = _state.value.email.trim()
        when (val result = authRepository.requestPasswordReset(email, captchaToken)) {
            is ApiResult.Failure.Network -> _state.update {
                it.copy(loading = false, submitError = messages.offline)
            }
            else -> {
                if (result is ApiResult.Failure) {
                    // Not shown to the user; recorded so a broken reset lane
                    // is still visible to us.
                    crashReporter.log("password reset request failed: ${failureCode(result)}")
                }
                _state.update { it.copy(loading = false, resetSent = true) }
            }
        }
    }

    private fun failureCode(failure: ApiResult.Failure): String = when (failure) {
        is ApiResult.Failure.Api -> failure.code
        is ApiResult.Failure.Malformed -> "MALFORMED_RESPONSE"
        is ApiResult.Failure.Network -> "NETWORK"
    }

    private suspend fun register(captchaToken: String?, messages: SignInMessages) {
        val s = _state.value
        finish(
            authRepository.register(
                email = s.email.trim(),
                password = s.password,
                displayName = s.displayName.trim().ifBlank { null },
                captchaToken = captchaToken,
            ),
            messages,
        )
    }

    private fun finish(result: ApiResult<*>, messages: SignInMessages) {
        when (result) {
            is ApiResult.Success -> _state.update { it.copy(loading = false) }
            is ApiResult.Failure.Api -> _state.update {
                it.copy(loading = false, submitError = result.message.ifBlank { messages.generic })
            }
            is ApiResult.Failure.Network -> _state.update {
                it.copy(loading = false, submitError = messages.offline)
            }
            is ApiResult.Failure.Malformed -> _state.update {
                it.copy(loading = false, submitError = messages.generic)
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
    val messages = SignInMessages(
        generic = stringResource(R.string.signin_error_generic),
        offline = stringResource(R.string.signin_error_offline),
        challengeUnavailable = stringResource(R.string.captcha_error_unavailable),
        challengeFailed = stringResource(R.string.captcha_error_failed),
        challengeCancelled = stringResource(R.string.captcha_error_cancelled),
    )

    state.challengeAction?.let { action ->
        TurnstileChallenge(
            action = action,
            webBaseUrl = BuildConfig.WEB_BASE_URL,
            onResult = { outcome -> viewModel.onChallengeResult(outcome, messages) },
        )
    }

    if (state.resetSent) {
        // Deliberately says "if that address has an account" rather than
        // confirming one exists — see SignInViewModel.sendResetMail.
        AlertDialog(
            onDismissRequest = viewModel::dismissResetSent,
            title = { Text(text = stringResource(R.string.signin_reset_sent_title)) },
            text = { Text(text = stringResource(R.string.signin_reset_sent_body)) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissResetSent) {
                    Text(text = stringResource(R.string.signin_reset_sent_dismiss))
                }
            },
        )
    }

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
                onClick = { viewModel.submit(messages) },
                enabled = state.canSubmit,
                loading = state.loading,
                modifier = Modifier.padding(top = 24.dp),
            )
            if (!state.registerMode) {
                TextButton(
                    onClick = { viewModel.requestPasswordReset(messages) },
                    // Reachable while an address is being typed but not while a
                    // request is already in flight.
                    enabled = !state.loading,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 4.dp),
                ) {
                    Text(
                        text = stringResource(R.string.signin_forgot_password),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
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
        ChecklistRow(met = state.passwordHasLowercase, label = stringResource(R.string.signin_error_password_lowercase))
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
