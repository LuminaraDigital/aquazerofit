package fit.aquazero.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dagger.hilt.android.AndroidEntryPoint
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.navigation.DeepLinkStore
import fit.aquazero.app.core.security.AppLockBlockReason
import fit.aquazero.app.core.security.DeviceSecurityController
import kotlinx.coroutines.launch
import javax.inject.Inject
import android.graphics.Color as AndroidColor

/**
 * The single activity. Installs the splash screen, goes edge-to-edge with
 * dark system bars (the theme is dark-only), enforces enterprise device
 * security policies (`FLAG_SECURE`, background app-lock timeout, and MDM
 * `RestrictionsManager` updates), and hosts the Navigation 3 root.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var deepLinkStore: DeepLinkStore

    @Inject lateinit var deviceSecurityController: DeviceSecurityController

    private val restrictionsChangedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            deviceSecurityController.refreshRestrictions()
            maybePromptForDeviceUnlock()
        }
    }

    @Suppress("DEPRECATION")
    private val confirmDeviceCredentialLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val unlocked = deviceSecurityController.onUnlockPromptResult(
                unlocked = result.resultCode == Activity.RESULT_OK,
            )
            if (!unlocked) {
                moveTaskToBack(true)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        observeWindowSecurityFlags()

        // Only on a genuinely fresh launch. A non-null savedInstanceState means
        // this activity is being rebuilt — a rotation, a theme change, a restore
        // after process death — and Android hands `intent` back unchanged each
        // time. Re-parsing it there would re-navigate on every rotation, undoing
        // wherever the user had got to since the link opened. The back stack is
        // already restored by then, and DeepLinkStore is @Singleton, so a link
        // still queued because the user was signed out survives regardless.
        if (savedInstanceState == null) {
            deepLinkStore.parseJoinChallengeIntent(intent)?.let(deepLinkStore::publish)
            deepLinkStore.parseShortcutIntent(intent)?.let(deepLinkStore::publish)
        }

        // Dark-only theme: force dark scrims regardless of system setting.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
        )
        setContent {
            AzfTheme {
                val isLocked by deviceSecurityController.isLocked.collectAsStateWithLifecycle()
                val lockBlockReason by deviceSecurityController.lockBlockReason.collectAsStateWithLifecycle()
                // No root Surface. The window background is already
                // `deep_sea_background` (themes.xml) and every screen's
                // Scaffold paints `colorScheme.background` over it, so an
                // opaque full-screen Surface here was a third paint of the
                // identical colour on every frame.
                //
                // The one thing the Surface did provide is the content colour
                // for anything drawn outside a Scaffold — the toast host and
                // the pre-auth flow — so that is provided directly. It costs
                // nothing to draw. Nothing depended on the Surface's shape or
                // elevation: both were left at their defaults.
                CompositionLocalProvider(
                    LocalContentColor provides MaterialTheme.colorScheme.onBackground,
                ) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        Box(
                            modifier = if (isLocked) {
                                Modifier.fillMaxSize().clearAndSetSemantics {}
                            } else {
                                Modifier.fillMaxSize()
                            },
                        ) {
                            AzfNavigation()
                            if (!isLocked) {
                                IntroVideo()
                            }
                        }
                        if (isLocked) {
                            AppLockPrivacyVeil(
                                blockReason = lockBlockReason,
                                onUnlock = { maybePromptForDeviceUnlock(manualRetry = true) },
                                onOpenSecuritySettings = ::openSecuritySettings,
                                onBack = { moveTaskToBack(true) },
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(
            this,
            restrictionsChangedReceiver,
            IntentFilter(Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        deviceSecurityController.refreshRestrictions()
        maybePromptForDeviceUnlock()
    }

    override fun onStop() {
        unregisterReceiver(restrictionsChangedReceiver)
        deviceSecurityController.onAppStopped(
            nowElapsedMs = SystemClock.elapsedRealtime(),
            isChangingConfigurations = isChangingConfigurations,
        )
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLinkStore.parseJoinChallengeIntent(intent)?.let(deepLinkStore::publish)
        deepLinkStore.parseShortcutIntent(intent)?.let(deepLinkStore::publish)
    }

    private fun observeWindowSecurityFlags() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                deviceSecurityController.state.collect { security ->
                    if (security.effectiveScreenCaptureProtection) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun maybePromptForDeviceUnlock(manualRetry: Boolean = false) {
        val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        val shouldPrompt = deviceSecurityController.shouldLaunchUnlockPrompt(
            nowElapsedMs = SystemClock.elapsedRealtime(),
            isDeviceSecure = keyguard?.isDeviceSecure == true,
            manualRetry = manualRetry,
        )
        if (!shouldPrompt) return
        val promptIntent = keyguard?.createConfirmDeviceCredentialIntent(
            getString(R.string.security_app_lock_prompt_title),
            getString(R.string.security_app_lock_prompt_description),
        ) ?: run {
            deviceSecurityController.onUnlockPromptLaunchFailed()
            return
        }
        runCatching { confirmDeviceCredentialLauncher.launch(promptIntent) }
            .onFailure { deviceSecurityController.onUnlockPromptLaunchFailed() }
    }

    private fun openSecuritySettings() {
        val opened = runCatching {
            startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
        }.isSuccess
        if (!opened) {
            runCatching { startActivity(Intent(Settings.ACTION_SETTINGS)) }
        }
    }
}

/**
 * Full-screen opaque privacy veil rendered over [AzfNavigation] whenever app
 * lock is active, preventing health and nutrition screens from flashing before
 * or behind the system credential sheet and holding MDM-enforced locks closed
 * when the device has no screen lock configured.
 */
@Composable
private fun AppLockPrivacyVeil(
    blockReason: AppLockBlockReason?,
    onUnlock: () -> Unit,
    onOpenSecuritySettings: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(enabled = true, onBack = onBack)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {},
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(48.dp),
            )
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = stringResource(
                    if (blockReason == AppLockBlockReason.DEVICE_NOT_SECURE) {
                        R.string.security_app_lock_setup_title
                    } else {
                        R.string.security_app_lock_prompt_title
                    },
                ),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = stringResource(
                    when (blockReason) {
                        AppLockBlockReason.DEVICE_NOT_SECURE -> R.string.security_app_lock_setup_body
                        AppLockBlockReason.PROMPT_UNAVAILABLE -> R.string.security_app_lock_unavailable_body
                        null -> R.string.security_app_lock_prompt_description
                    },
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(28.dp))
            if (blockReason == AppLockBlockReason.DEVICE_NOT_SECURE) {
                PrimaryButton(
                    text = stringResource(R.string.security_app_lock_open_settings),
                    onClick = onOpenSecuritySettings,
                )
            } else {
                PrimaryButton(
                    text = stringResource(R.string.security_app_lock_retry),
                    onClick = onUnlock,
                )
                if (blockReason == AppLockBlockReason.PROMPT_UNAVAILABLE) {
                    Spacer(modifier = Modifier.height(12.dp))
                    SecondaryButton(
                        text = stringResource(R.string.security_app_lock_open_settings),
                        onClick = onOpenSecuritySettings,
                    )
                }
            }
        }
    }
}
