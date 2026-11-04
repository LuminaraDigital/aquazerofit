package fit.aquazero.app.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.security.DeviceSecurityController
import fit.aquazero.app.core.security.DeviceSecurityState
import fit.aquazero.app.core.security.ManagedRestrictions
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Compose UI verification for the enterprise device-security controls and MDM
 * managed configuration enforcement in Settings (`EN-2.1`, `EN-2.2`, `EN-3.3`).
 */
class SettingsScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun deviceSecurityTogglesUpdateStateWhenUnrestrictedByMdm() {
        val controller = DeviceSecurityController(DeviceSecurityState())
        var exportClicked = false

        composeRule.setContent {
            val security by controller.state.collectAsState()
            AzfTheme {
                Column {
                    DeviceSecurityCard(
                        security = security,
                        onAppLockChanged = controller::setUserAppLockEnabled,
                        onScreenCaptureChanged = controller::setUserScreenCaptureProtectionEnabled,
                    )
                    DataExportRow(
                        exporting = false,
                        dataExportAllowed = security.dataExportAllowed,
                        onExport = { exportClicked = true },
                    )
                }
            }
        }

        assertFalse(controller.state.value.effectiveAppLockEnabled)
        assertFalse(controller.state.value.effectiveScreenCaptureProtection)

        composeRule.onNodeWithText("Require device unlock").assertIsDisplayed().performClick()
        assertTrue(controller.state.value.effectiveAppLockEnabled)

        composeRule.onNodeWithText("Block screenshots & recents preview")
            .assertIsDisplayed()
            .performClick()
        assertTrue(controller.state.value.effectiveScreenCaptureProtection)

        composeRule.onNodeWithText("Export my data (JSON)")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()
        assertTrue(exportClicked)
    }

    @Test
    fun mdmPolicyForcesSecurityControlsAndDisablesDataExport() {
        val controller = DeviceSecurityController(
            DeviceSecurityState(
                restrictions = ManagedRestrictions(
                    forceAppLock = true,
                    forceScreenCaptureProtection = true,
                    disableDataExport = true,
                ),
            ),
        )

        composeRule.setContent {
            val security by controller.state.collectAsState()
            AzfTheme {
                Column {
                    DeviceSecurityCard(
                        security = security,
                        onAppLockChanged = controller::setUserAppLockEnabled,
                        onScreenCaptureChanged = controller::setUserScreenCaptureProtectionEnabled,
                    )
                    DataExportRow(
                        exporting = false,
                        dataExportAllowed = security.dataExportAllowed,
                        onExport = {},
                    )
                }
            }
        }

        composeRule
            .onNodeWithText("Data export is disabled by your organisation's device policy.")
            .assertIsDisplayed()
        composeRule
            .onNodeWithText("Export my data (JSON)")
            .assertIsNotEnabled()
    }
}
