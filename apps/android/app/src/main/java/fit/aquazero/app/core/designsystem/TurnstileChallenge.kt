package fit.aquazero.app.core.designsystem

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import fit.aquazero.app.R
import fit.aquazero.app.core.model.TurnstileFailure
import fit.aquazero.app.core.model.TurnstileOutcome
import kotlinx.coroutines.delay
import java.net.URLEncoder

/**
 * Cloudflare Turnstile, rendered in a WebView.
 *
 * Turnstile has no native Android SDK, and serving the widget from
 * `file:///android_asset` produces a null origin that Cloudflare rejects. So
 * the challenge is a real page on the app's own web origin
 * (`${WEB_BASE_URL}/mobile/captcha?action=…`) — the origin the Turnstile site
 * key is already configured for — and the token comes back over a two-method
 * JavaScript bridge.
 *
 * Why this lives in `core/designsystem` rather than in a feature package:
 * registration is in `feature/onboarding` and password reset will land
 * wherever it lands, and AGENTS.md is explicit that anything two features need
 * is shared code, never reached across from one feature to another. There is
 * no `core/ui` source set in this build, so `core/designsystem` — where every
 * other shared composable already lives — is the shared home.
 */

/** Name the challenge page calls this bridge by: `AzfCaptcha.onToken(...)`. */
private const val BRIDGE_NAME = "AzfCaptcha"

/** Path of the challenge page on the web origin. */
private const val CHALLENGE_PATH = "/mobile/captcha"

/**
 * How long the page gets to finish loading before the attempt is abandoned.
 *
 * This is a load watchdog, not a solve deadline: it is cancelled the moment
 * the page finishes, and an interactive challenge can then take as long as the
 * person needs. Without it, a connection that opens and then stalls leaves a
 * spinner that never resolves and a form that never submits — the silent hang
 * this whole surface exists to avoid.
 */
private const val PAGE_LOAD_TIMEOUT_MS = 20_000L

/** Widget height plus the room an interactive challenge expands into. */
private val ChallengeHeight = 360.dp

/** Action name for the registration form; matches the server's audit label. */
const val CAPTCHA_ACTION_REGISTER: String = "register"

/** Action name for the password-reset request form. */
const val CAPTCHA_ACTION_PASSWORD_RESET: String = "password-reset"

/** Build the challenge URL. Separated from the WebView so it can be asserted on. */
internal fun challengeUrl(webBaseUrl: String, action: String): String {
    val encoded = URLEncoder.encode(action, Charsets.UTF_8.name())
    return webBaseUrl.trimEnd('/') + CHALLENGE_PATH + "?action=" + encoded
}

/**
 * Show the challenge and report its single outcome.
 *
 * The caller renders this only while it needs a token, and removes it as soon
 * as [onResult] fires. Every path out is terminal and explicit — token, page
 * failure, widget failure, dismissal — so there is no way to leave here having
 * neither a token nor an error, and no way to leave having quietly skipped the
 * gate.
 *
 * @param action names the form for the server's audit line
 *   ([CAPTCHA_ACTION_REGISTER], [CAPTCHA_ACTION_PASSWORD_RESET]).
 * @param webBaseUrl origin of the challenge page, and the only origin this
 *   WebView is allowed to navigate its main frame to.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TurnstileChallenge(
    action: String,
    webBaseUrl: String,
    onResult: (TurnstileOutcome) -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val currentOnResult by rememberUpdatedState(onResult)
    val surface = MaterialTheme.colorScheme.surfaceContainerHigh
    var pageLoaded by remember { mutableStateOf(false) }

    // The bridge fires on a private binder thread; Compose state and the
    // caller's callback both belong to the main thread.
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val latch = remember {
        TurnstileLatch { outcome -> mainHandler.post { currentOnResult(outcome) } }
    }
    val url = remember(webBaseUrl, action) { challengeUrl(webBaseUrl, action) }

    LaunchedEffect(url, pageLoaded) {
        if (pageLoaded) return@LaunchedEffect
        delay(PAGE_LOAD_TIMEOUT_MS)
        latch.fail(TurnstileFailure.PageUnavailable)
    }

    ModalBottomSheet(
        onDismissRequest = { latch.fail(TurnstileFailure.Dismissed) },
        modifier = modifier,
        sheetState = sheetState,
        containerColor = surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.ContainerMargin),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.captcha_title).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.captcha_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            Box(
                modifier = Modifier
                    .padding(top = 16.dp)
                    .fillMaxWidth()
                    .height(ChallengeHeight)
                    .clip(AzfShapes.Card),
                contentAlignment = Alignment.Center,
            ) {
                if (!pageLoaded) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.primary,
                        strokeWidth = 2.dp,
                    )
                }
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        challengeWebView(
                            context = context,
                            expectedOrigin = webBaseUrl,
                            backgroundArgb = surface.toArgb(),
                            latch = latch,
                            onLoaded = { pageLoaded = true },
                        ).also { it.loadUrl(url) }
                    },
                    onRelease = ::releaseWebView,
                )
            }
        }
    }
}

/**
 * Build the challenge WebView with the narrowest configuration that can still
 * render a Turnstile widget.
 *
 * Enabled, deliberately and exclusively:
 *  - `javaScriptEnabled` — Turnstile is a script; without it there is no
 *    widget at all. Set on THIS WebView instance only. It is a per-WebView
 *    setting, this is the app's only WebView, and no global is touched.
 *
 * Explicitly refused rather than left to the platform default, because below
 * API 30 several of these default to permissive and `minSdk` here is 26:
 *  - `allowFileAccess`, `allowContentAccess`, `allowFileAccessFromFileURLs`,
 *    `allowUniversalAccessFromFileURLs` — a remote page must not be able to
 *    reach this app's files or content providers.
 *  - `domStorageEnabled` — left OFF. Turnstile has not been shown to need it,
 *    and DOM storage is persistent state for a page whose whole job lasts one
 *    sheet. If a real site key later shows the widget failing to initialise
 *    with a storage error, this is the one line to flip — and the reason
 *    belongs written down beside it.
 *  - `javaScriptCanOpenWindowsAutomatically`, `setSupportMultipleWindows` — no
 *    popups; there is no `WebChromeClient` here to service one.
 *  - `setGeolocationEnabled(false)` — it defaults to TRUE, and this page has
 *    no business asking.
 *  - `mixedContentMode = NEVER_ALLOW` — the origin is https and stays https.
 *
 * Nothing here signs a request: no cookie is set by us, no `Authorization`
 * header is attached, and the page is unauthenticated by design.
 */
@SuppressLint("SetJavaScriptEnabled")
private fun challengeWebView(
    context: Context,
    expectedOrigin: String,
    backgroundArgb: Int,
    latch: TurnstileLatch,
    onLoaded: () -> Unit,
): WebView = WebView(context).apply {
    layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
    )
    // Paint the app's own surface behind the page so there is no white flash
    // before the (dark) challenge page paints its own background.
    setBackgroundColor(backgroundArgb)
    isVerticalScrollBarEnabled = false
    isHorizontalScrollBarEnabled = false

    with(settings) {
        javaScriptEnabled = true
        domStorageEnabled = false
        allowFileAccess = false
        allowContentAccess = false
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        javaScriptCanOpenWindowsAutomatically = false
        setSupportMultipleWindows(false)
        setGeolocationEnabled(false)
        mediaPlaybackRequiresUserGesture = true
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
    }

    addJavascriptInterface(
        TurnstileJsBridge(
            tokenReceived = { token -> latch.token(token) },
            // The reason string comes from a remote page. It decides which of
            // our own messages to show and is never itself shown.
            errorReceived = { _ -> latch.fail(TurnstileFailure.ChallengeFailed) },
        ),
        BRIDGE_NAME,
    )
    webViewClient = ChallengeWebViewClient(expectedOrigin, latch, onLoaded)
}

/** Tear down in the order the platform wants: stop, unhook the bridge, destroy. */
private fun releaseWebView(webView: WebView) {
    webView.stopLoading()
    webView.removeJavascriptInterface(BRIDGE_NAME)
    webView.webViewClient = WebViewClient()
    webView.loadUrl("about:blank")
    webView.destroy()
}

/**
 * Keeps the main frame on the origin we asked for, and turns every way the
 * page can fail to load into one terminal [TurnstileFailure.PageUnavailable].
 *
 * The origin check applies to MAIN-FRAME navigation only, and that is the
 * point rather than an oversight: the `AzfCaptcha` bridge is injected into the
 * main frame alone, so it is the main frame that must not be allowed to move.
 * Turnstile's own widget renders in a subframe served from
 * `challenges.cloudflare.com`, which cannot see the bridge and has to be
 * allowed to load or there is no challenge to solve.
 */
private class ChallengeWebViewClient(
    private val expectedOrigin: String,
    private val latch: TurnstileLatch,
    private val onLoaded: () -> Unit,
) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (!request.isForMainFrame) return false
        // true == "the app handled it", i.e. the WebView must not load it. It
        // is handled by doing nothing at all: no browser hand-off, no intent.
        return !isSameOrigin(expectedOrigin, request.url?.toString())
    }

    override fun onPageFinished(view: WebView, url: String?) {
        if (isSameOrigin(expectedOrigin, url)) onLoaded()
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        if (request.isForMainFrame) latch.fail(TurnstileFailure.PageUnavailable)
    }

    override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        errorResponse: WebResourceResponse,
    ) {
        if (request.isForMainFrame) latch.fail(TurnstileFailure.PageUnavailable)
    }

    /**
     * Returning true claims the dead renderer, which is the difference between
     * one failed challenge and the whole app process being killed with it.
     */
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        latch.fail(TurnstileFailure.PageUnavailable)
        return true
    }
}
