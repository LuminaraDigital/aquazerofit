package fit.aquazero.app.core.ui

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AssetImage
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.BrandAssets

/**
 * Coach art with the roster's required degradation: **portrait → avatar →
 * monogram**.
 *
 * Resolved by asking the [android.content.res.AssetManager] whether the file
 * is actually bundled rather than by letting an image request fail. A loader
 * error arrives a frame or two late, which on the nine-up character-select
 * grid reads as portraits popping into placeholders; a synchronous existence
 * check on a local asset costs a file handle and renders the right thing on
 * the first pass. It also makes `@Preview` render the monogram cleanly instead
 * of an empty box, which is the state a coach with no art actually ships in.
 *
 * Lives with [CoachPersona] for the same reason: the celebration and unlock
 * surfaces draw a coach too, and a shared composable is what stops them
 * importing a feature to do it.
 */
private fun assetExists(context: Context, path: String): Boolean = runCatching {
    context.assets.open(path).close()
    true
}.getOrDefault(false)

/** Which art file, if any, backs this coach at the requested size. */
private enum class ArtSource { Portrait, Avatar, Monogram }

@Composable
private fun rememberArtSource(coachId: String, preferPortrait: Boolean): ArtSource {
    val context = LocalContext.current
    return remember(coachId, preferPortrait) {
        val portrait = BrandAssets.coachPortrait(coachId)
        val avatar = BrandAssets.coachAvatar(coachId)
        when {
            preferPortrait && assetExists(context, portrait) -> ArtSource.Portrait
            assetExists(context, avatar) -> ArtSource.Avatar
            assetExists(context, portrait) -> ArtSource.Portrait
            else -> ArtSource.Monogram
        }
    }
}

/**
 * Square coach crop for the chat byline, header and roster row. Falls back
 * through the avatar to a coloured monogram.
 */
@Composable
fun CoachAvatar(
    persona: CoachPersona,
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    contentDescription: String? = null,
) {
    val source = rememberArtSource(persona.id, preferPortrait = false)
    val shape = CircleShape
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(persona.colour.copy(alpha = 0.18f))
            .border(BorderStroke(1.dp, persona.colour.copy(alpha = 0.55f)), shape),
        contentAlignment = Alignment.Center,
    ) {
        when (source) {
            ArtSource.Monogram -> Monogram(persona, size)
            ArtSource.Avatar -> AssetImage(
                assetPath = BrandAssets.coachAvatar(persona.id),
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
            ArtSource.Portrait -> AssetImage(
                assetPath = BrandAssets.coachPortrait(persona.id),
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
    }
}

/**
 * Full-body character-select portrait. [dimmed] greys a locked coach without
 * hiding them — a ladder you cannot see is a ladder nobody climbs.
 */
@Composable
fun CoachPortrait(
    persona: CoachPersona,
    modifier: Modifier = Modifier,
    shape: Shape = AzfShapes.Inner,
    dimmed: Boolean = false,
    contentDescription: String? = null,
) {
    val source = rememberArtSource(persona.id, preferPortrait = true)
    val alpha = if (dimmed) 0.45f else 1f
    Box(
        modifier = modifier
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        persona.colour.copy(alpha = 0.22f * alpha),
                        MaterialTheme.colorScheme.surfaceContainerLow,
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        when (source) {
            ArtSource.Monogram -> Monogram(persona, 96.dp, dimmed = dimmed)
            ArtSource.Portrait -> AssetImage(
                assetPath = BrandAssets.coachPortrait(persona.id),
                contentDescription = contentDescription,
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (dimmed) Modifier.dim() else Modifier),
                contentScale = ContentScale.Crop,
            )
            ArtSource.Avatar -> AssetImage(
                assetPath = BrandAssets.coachAvatar(persona.id),
                contentDescription = contentDescription,
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (dimmed) Modifier.dim() else Modifier),
                contentScale = ContentScale.Crop,
            )
        }
    }
}

/** Locked-state veil: opacity only, never a colour cast that reads as failure. */
private fun Modifier.dim(): Modifier = this.then(
    Modifier.background(AzfDimVeil),
)

private val AzfDimVeil = Brush.verticalGradient(
    listOf(
        androidx.compose.ui.graphics.Color(0x8C0E1416),
        androidx.compose.ui.graphics.Color(0xB30E1416),
    ),
)

/** Last-resort identity mark: the coach's initial in their own colour. */
@Composable
private fun Monogram(persona: CoachPersona, size: Dp, dimmed: Boolean = false) {
    Text(
        text = persona.monogram,
        style = MaterialTheme.typography.headlineMedium.copy(
            fontSize = (size.value * 0.42f).sp,
        ),
        color = persona.colour.copy(alpha = if (dimmed) 0.5f else 0.95f),
        textAlign = TextAlign.Center,
        modifier = Modifier.clearAndSetSemantics { },
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun CoachAvatarPreview() {
    AzfTheme {
        Row(Modifier.padding(16.dp)) {
            CoachRoster.personas.take(4).forEach { persona ->
                CoachAvatar(
                    persona = persona,
                    size = 40.dp,
                    contentDescription = stringResource(R.string.coach_portrait_cd, persona.name),
                    modifier = Modifier.padding(end = 8.dp),
                )
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 220, heightDp = 200)
@Composable
private fun CoachPortraitPreview() {
    AzfTheme {
        Row(Modifier.padding(16.dp)) {
            CoachPortrait(
                persona = CoachRoster.default(),
                modifier = Modifier
                    .size(width = 84.dp, height = 140.dp)
                    .padding(end = 8.dp),
            )
            CoachPortrait(
                persona = CoachRoster.personas.last(),
                dimmed = true,
                modifier = Modifier.size(width = 84.dp, height = 140.dp),
            )
        }
    }
}
