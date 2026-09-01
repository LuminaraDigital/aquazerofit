package fit.aquazero.app.feature.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AssetImage
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.BrandAssets
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.revealOnEnter

/**
 * Onboarding carousel — 3 slides of brand copy, then Get Started (register)
 * or sign-in. Mirrors the web's `Welcome.tsx` without the Telegram lane.
 */
@Composable
fun WelcomeScreen(
    onGetStarted: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val slides = listOf(
        Triple(R.string.welcome_slide1_title, R.string.welcome_slide1_subtitle, true),
        Triple(R.string.welcome_slide2_title, R.string.welcome_slide2_subtitle, false),
        Triple(R.string.welcome_slide3_title, R.string.welcome_slide3_subtitle, false),
    )
    val pagerState = rememberPagerState { slides.size }

    Column(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = AzfSpacing.ContainerMargin),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Brand header
        Row(
            modifier = Modifier
                .padding(top = 40.dp)
                .revealOnEnter(0),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AssetImage(
                assetPath = BrandAssets.LOGO,
                contentDescription = stringResource(R.string.welcome_logo),
                modifier = Modifier.size(36.dp),
            )
            Text(
                text = stringResource(R.string.app_name).uppercase(),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 8.dp),
            )
        }

        // Carousel
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .revealOnEnter(1),
        ) { page ->
            val (titleRes, subtitleRes, showLogo) = slides[page]
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
            ) {
                if (showLogo) {
                    AssetImage(
                        assetPath = BrandAssets.MARK,
                        contentDescription = null,
                        modifier = Modifier
                            .size(160.dp)
                            .padding(bottom = 24.dp),
                    )
                }
                Text(
                    text = stringResource(titleRes).uppercase(),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(subtitleRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }

        // Indicator dots — asymmetric active width, like the web
        Row(modifier = Modifier.padding(vertical = 16.dp)) {
            repeat(slides.size) { index ->
                val active = pagerState.currentPage == index
                Box(
                    modifier = Modifier
                        .padding(horizontal = 3.dp)
                        .height(4.dp)
                        .width(if (active) 28.dp else 6.dp)
                        .clip(AzfShapes.Pill)
                        .background(
                            if (active) {
                                LocalAzfExtended.current.primaryFixedDim
                            } else {
                                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                            },
                        ),
                )
            }
        }

        // Footer actions
        Column(modifier = Modifier.revealOnEnter(2)) {
            PrimaryButton(
                text = stringResource(R.string.welcome_get_started),
                onClick = onGetStarted,
            )
            SecondaryButton(
                text = stringResource(R.string.welcome_have_account),
                onClick = onSignIn,
                modifier = Modifier.padding(top = 12.dp),
            )
            Text(
                text = stringResource(R.string.welcome_disclaimer).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 16.dp),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WelcomeScreenPreview() {
    AzfTheme {
        WelcomeScreen(onGetStarted = {}, onSignIn = {})
    }
}
