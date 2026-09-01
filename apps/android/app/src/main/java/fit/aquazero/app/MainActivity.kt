package fit.aquazero.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import dagger.hilt.android.AndroidEntryPoint
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.navigation.DeepLinkStore
import javax.inject.Inject
import android.graphics.Color as AndroidColor

/**
 * The single activity. Installs the splash screen, goes edge-to-edge with
 * dark system bars (the theme is dark-only), and hosts the Navigation 3 root.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var deepLinkStore: DeepLinkStore

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        deepLinkStore.parseJoinChallengeIntent(intent)?.let(deepLinkStore::publish)
        deepLinkStore.parseShortcutIntent(intent)?.let(deepLinkStore::publish)

        // Dark-only theme: force dark scrims regardless of system setting.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
        )
        setContent {
            AzfTheme {
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
                    AzfNavigation()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLinkStore.parseJoinChallengeIntent(intent)?.let(deepLinkStore::publish)
        deepLinkStore.parseShortcutIntent(intent)?.let(deepLinkStore::publish)
    }
}
