package fit.aquazero.app.feature.settings

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.ui.graphics.toArgb
import androidx.core.net.toUri
import fit.aquazero.app.BuildConfig
import fit.aquazero.app.core.designsystem.AzfColors

/**
 * The pages this app deliberately does not rebuild natively.
 *
 * Privacy, terms and support stay on the web (plan §1): they change on a
 * release cadence of their own, and a policy shipped inside an APK is a policy
 * that is stale until the next store review. The source link is not a
 * courtesy — AGPL-3.0 §13 requires it to be reachable from the running app.
 */
object ExternalLinks {

    /** Published privacy policy — also the URL declared in the Play listing. */
    val PRIVACY: String = "${BuildConfig.WEB_BASE_URL}/privacy"

    /** Terms of use. */
    val TERMS: String = "${BuildConfig.WEB_BASE_URL}/terms"

    /** Support / contact. */
    val SUPPORT: String = "${BuildConfig.WEB_BASE_URL}/support"

    /**
     * Web deletion route. Play requires a way to request deletion without
     * reinstalling the app (plan §6.6, §8); the in-app flow is the primary
     * path and this is the one a person can reach from a browser.
     */
    val ACCOUNT_DELETION: String = "${BuildConfig.WEB_BASE_URL}/account/deletion"

    /** `SOURCE_CODE_URL` in `packages/shared/src/constants.ts`. */
    const val SOURCE_CODE: String = "https://github.com/LuminaraDigital/aquazerofit"

    /** The licence text itself, for the AGPL notice. */
    const val LICENCE: String = "$SOURCE_CODE/blob/main/LICENSE"
}

/**
 * Open [url] in a Chrome Custom Tab, themed to match the app.
 *
 * Falls back to a plain view intent when no browser supports Custom Tabs, and
 * does nothing at all when the device has no browser — a dead link is a poor
 * outcome, but an `ActivityNotFoundException` crash on a Settings tap is worse.
 * Returns true when something was launched, so callers can say so.
 */
fun Context.openInCustomTab(url: String): Boolean {
    val uri: Uri = runCatching { url.toUri() }.getOrNull() ?: return false
    val intent = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .setUrlBarHidingEnabled(true)
        .setDefaultColorSchemeParams(
            CustomTabColorSchemeParams.Builder()
                .setToolbarColor(AzfColors.SurfaceContainerLow.toArgb())
                .build(),
        )
        .build()
    intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        intent.launchUrl(this, uri)
        true
    } catch (_: ActivityNotFoundException) {
        try {
            startActivity(
                Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }
}
