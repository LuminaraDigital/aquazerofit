package fit.aquazero.app.core.designsystem

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Golden-image tests for the shared design-system components, one PNG per
 * state, in app/src/test/screenshots. They make a token change visible in
 * review: change a colour, radius or type style and the verify run in
 * `./gradlew test` fails until the goldens are re-recorded with
 * `./gradlew test -Proborazzi.test.record=true -Proborazzi.test.verify=false`
 * and the diff is reviewed.
 *
 * Determinism: device, density and SDK are pinned; the system animation scale
 * is zero so [AzfTheme] resolves reduced motion (Skeleton renders its static
 * block, fills and tints snap); the Compose clock is manual and advanced a
 * fixed amount, which freezes the one indeterminate spinner on the same frame.
 * SDK 35 because 36+ needs a Java 21 test JVM and CI and local runs use 17.
 * NATIVE graphics so Barlow Condensed and DM Sans really rasterise.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h640dp-xxhdpi")
class DesignSystemScreenshotTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun disableAnimations() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        Settings.Global.putFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
    }

    private fun shoot(name: String, content: @Composable () -> Unit) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            AzfTheme {
                Box(Modifier.background(AzfColors.Background).padding(16.dp)) { content() }
            }
        }
        compose.mainClock.advanceTimeBy(SETTLE_MS)
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    // -- headers -------------------------------------------------------------

    @Test
    fun appHeaderTitleOnly() = shoot("app_header_title_only") {
        AzfAppHeader(title = "Today")
    }

    @Test
    fun appHeaderBackAndTrailing() = shoot("app_header_back_trailing") {
        AzfAppHeader(
            title = "Meal log",
            onBack = {},
            trailing = { Icon(Icons.Outlined.Settings, contentDescription = null) },
        )
    }

    @Test
    fun sectionHeading() = shoot("section_heading") {
        AzfSectionHeading(text = "Daily targets")
    }

    // -- surfaces ------------------------------------------------------------

    @Test
    fun cardHero() = card("card_hero", AzfCardTier.Hero)

    @Test
    fun cardStandard() = card("card_standard", AzfCardTier.Standard)

    @Test
    fun cardCompact() = card("card_compact", AzfCardTier.Compact)

    private fun card(name: String, tier: AzfCardTier) = shoot(name) {
        AzfCard(tier = tier) { Text("${tier.name} card", color = AzfColors.OnSurface) }
    }

    @Test
    fun heroSurface() = shoot("hero_surface") {
        AzfHeroSurface { Text("Lead card", color = AzfColors.OnSurface) }
    }

    @Test
    fun activeFrameActive() = activeFrame("active_frame_active", active = true)

    @Test
    fun activeFrameIdle() = activeFrame("active_frame_idle", active = false)

    private fun activeFrame(name: String, active: Boolean) = shoot(name) {
        ActiveFrame(active = active) {
            Text("Frame", color = AzfColors.OnSurface, modifier = Modifier.padding(16.dp))
        }
    }

    // -- buttons -------------------------------------------------------------

    @Test
    fun primaryButtonEnabled() = shoot("primary_button_enabled") {
        PrimaryButton(text = "Log meal", onClick = {})
    }

    @Test
    fun primaryButtonDisabled() = shoot("primary_button_disabled") {
        PrimaryButton(text = "Log meal", onClick = {}, enabled = false)
    }

    @Test
    fun primaryButtonLoading() = shoot("primary_button_loading") {
        PrimaryButton(text = "Log meal", onClick = {}, loading = true)
    }

    @Test
    fun secondaryButtonNormal() = shoot("secondary_button_normal") {
        SecondaryButton(text = "Skip for now", onClick = {})
    }

    @Test
    fun secondaryButtonDestructive() = shoot("secondary_button_destructive") {
        SecondaryButton(text = "Delete account", onClick = {}, destructive = true)
    }

    // -- chips and stats -----------------------------------------------------

    @Test
    fun chipSelected() = shoot("chip_selected") {
        AzfChip(text = "High protein", selected = true, onClick = {})
    }

    @Test
    fun chipIdle() = shoot("chip_idle") {
        AzfChip(text = "High protein", selected = false, onClick = {})
    }

    @Test
    fun statRowScoreboard() = shoot("stat_row_scoreboard") {
        AzfStatRow(label = "CALORIES LEFT", value = "1,240", unit = "kcal", valueStyle = Scoreboard)
    }

    @Test
    fun statRowDataMedium() = shoot("stat_row_data_medium") {
        AzfStatRow(label = "PROTEIN", value = "128", unit = "g", valueStyle = DataMedium)
    }

    // -- async states --------------------------------------------------------

    @Test
    fun emptyState() = shoot("empty_state") {
        EmptyState(
            title = "Nothing logged yet",
            message = "Log your first meal to see the day's targets fill in.",
            actionLabel = "Log a meal",
            onAction = {},
        )
    }

    @Test
    fun errorStateDefaultIcon() = shoot("error_state_default_icon") {
        ErrorState(
            title = "Could not load your day",
            message = "Check your connection and try again.",
            retryLabel = "Retry",
            onRetry = {},
        )
    }

    @Test
    fun errorStateCustomIcon() = shoot("error_state_custom_icon") {
        ErrorState(
            title = "You are offline",
            message = "Your log is saved and will sync later.",
            icon = Icons.Outlined.WifiOff,
        )
    }

    @Test
    fun skeleton() = shoot("skeleton") {
        Column {
            Skeleton(Modifier.fillMaxWidth().height(24.dp))
            Row(Modifier.padding(top = 12.dp)) { Skeleton(Modifier.size(56.dp)) }
        }
    }

    // -- navigation and progress ---------------------------------------------

    @Test
    fun bottomNav() = shoot("bottom_nav") {
        AzfBottomNav(selected = AzfTab.Nutrition, onSelect = {}, onQuickLog = {})
    }

    @Test
    fun macroBar() = shoot("macro_bar") {
        MacroBar(label = "Protein", consumed = 96.0, target = 140.0, color = AzfColors.Secondary)
    }

    @Test
    fun levelBar() = shoot("level_bar") {
        LevelBar(level = 7, rankName = "Contender", levelProgress = 0.62f, earnedToday = 35)
    }

    private companion object {
        const val SETTLE_MS = 1_000L
    }
}
