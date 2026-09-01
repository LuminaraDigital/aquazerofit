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
import fit.aquazero.app.core.data.PlayPurchaseRules
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

    /**
     * Google Play's subscription settings, deep-linked to this product.
     *
     * The app cannot cancel a subscription on someone's behalf — Play owns
     * that, and Play policy requires the app to lead them to it rather than
     * describe where to look. Deep-linked with `sku` and `package` so it opens
     * on this subscription instead of a list of every one the person holds.
     */
    val PLAY_SUBSCRIPTION: String =
        "https://play.google.com/store/account/subscriptions" +
            "?sku=${PlayPurchaseRules.PREMIUM_PRODUCT_ID}&package=${BuildConfig.APPLICATION_ID}"
}

/**
 * Open Play's subscription settings for this app.
 *
 * A plain view intent, deliberately, where every other link here uses a Custom
 * Tab. Play verifies `play.google.com` as an app link, so this resolves to the
 * Play Store app and lands on the subscription itself; forcing it into a
 * browser instead would put the user on a web Play that asks them to sign in
 * again before it will let them cancel.
 *
 * The package is not pinned. An explicit `com.android.vending` would need a
 * `<queries>` declaration to survive package-visibility filtering on API 30+,
 * and would then fail outright on a device without Play — where the Custom Tab
 * fallback below is the honest answer.
 */
fun Context.openPlaySubscriptions(): Boolean {
    val uri: Uri = runCatching { ExternalLinks.PLAY_SUBSCRIPTION.toUri() }.getOrNull() ?: return false
    return try {
        startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        openInCustomTab(ExternalLinks.PLAY_SUBSCRIPTION)
    }
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
