package fit.aquazero.app.core.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage

/**
 * Bundled-asset image loader. Brand art ships in `assets/` (e.g.
 * `brand/akin-idle.jpg`, `coaches/akin/portrait.webp`) and loads through
 * Coil's `file:///android_asset/` scheme — no network, disk-cache free.
 */
@Composable
fun AssetImage(
    assetPath: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    AsyncImage(
        model = "file:///android_asset/${assetPath.trimStart('/')}",
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
    )
}

/** Well-known bundled asset paths. */
object BrandAssets {
    const val AKIN_IDLE = "brand/akin-idle.jpg"
    const val AKIN_GUARD = "brand/akin-guard.jpg"
    const val AKIN_LIFT = "brand/akin-lift.jpg"
    const val LOGO = "brand/logo.png"

    /**
     * The mark and the logo are the same artwork. `brand/mark.png` was a
     * byte-identical copy of `brand/logo.png` (83 KB shipped twice), so the
     * duplicate file is gone and both constants resolve to one asset. The
     * distinct name stays because call sites mean different things by it —
     * point this at real mark artwork if the brand ever diverges.
     */
    const val MARK = LOGO

    /** Portrait art for a coach id. */
    fun coachPortrait(coachId: String): String = "coaches/$coachId/portrait.webp"

    /** Avatar crop for a coach id. */
    fun coachAvatar(coachId: String): String = "coaches/$coachId/avatar.webp"
}
