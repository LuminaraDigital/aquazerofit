package fit.aquazero.app.core.gamification

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * High-Resolution Canvas Story Card Renderer (9:16 Instagram/Telegram Story format).
 *
 * Renders on-device branded milestone cards directly to Bitmap with zero server roundtrips,
 * fully preserving user privacy and enabling viral 1-tap distribution.
 */
object BragCardCanvasRenderer {

    const val STORY_WIDTH = 1080
    const val STORY_HEIGHT = 1920

    /**
     * Render the BragCardData into a 1080x1920 Bitmap.
     */
    fun renderStoryCard(data: BragCardData): Bitmap {
        val bitmap = Bitmap.createBitmap(STORY_WIDTH, STORY_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        drawBackground(canvas)
        drawBranding(canvas)
        drawStatCard(canvas)
        drawCoachAndRank(canvas, data)
        drawHighlightMetric(canvas, data)
        drawStatGrid(canvas, data)
        drawFooter(canvas)

        return bitmap
    }

    /** 1-2. Aquatic background gradient plus the cyan ambient glow. */
    private fun drawBackground(canvas: Canvas) {
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0f,
                0f,
                0f,
                STORY_HEIGHT.toFloat(),
                intArrayOf(Color.parseColor("#0A192F"), Color.parseColor("#020C1B")),
                null,
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, STORY_WIDTH.toFloat(), STORY_HEIGHT.toFloat(), bgPaint)

        val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                STORY_WIDTH * 0.5f,
                0f,
                STORY_WIDTH.toFloat(),
                STORY_HEIGHT * 0.4f,
                intArrayOf(Color.parseColor("#1A00F2FE"), Color.TRANSPARENT),
                null,
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawCircle(STORY_WIDTH * 0.8f, STORY_HEIGHT * 0.15f, 500f, glowPaint)
    }

    /** 3. Header branding lock-up. */
    private fun drawBranding(canvas: Canvas) {
        val brandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#00F2FE")
            textSize = 54f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            letterSpacing = 0.15f
        }
        canvas.drawText("AQUAZEROFIT", 80f, 160f, brandPaint)

        val subBrandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#8892B0")
            textSize = 28f
            typeface = Typeface.DEFAULT
            letterSpacing = 0.1f
        }
        canvas.drawText("AI WELLNESS & METABOLIC INTELLIGENCE", 80f, 210f, subBrandPaint)
    }

    /** 4. Central glassmorphic card: fill then border. */
    private fun drawStatCard(canvas: Canvas) {
        val cardBounds = RectF(80f, 280f, STORY_WIDTH - 80f, 1400f)
        val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#151F38")
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(cardBounds, 40f, 40f, cardPaint)

        val cardBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#233554")
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }
        canvas.drawRoundRect(cardBounds, 40f, 40f, cardBorderPaint)
    }

    /** 5. Coach persona, athlete rank, and the divider under them. */
    private fun drawCoachAndRank(canvas: Canvas, data: BragCardData) {
        val coachName = data.coach?.name ?: "Aqua Coach"
        val coachPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#64FFDA")
            textSize = 42f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        canvas.drawText("⚡ COACH: $coachName", 140f, 380f, coachPaint)

        val levelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 34f
            typeface = Typeface.DEFAULT
        }
        canvas.drawText("User Rank: Level ${data.level} Athlete", 140f, 440f, levelPaint)

        val divPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#233554")
            strokeWidth = 2f
        }
        canvas.drawLine(140f, 490f, STORY_WIDTH - 140f, 490f, divPaint)
    }

    /** 6. Hero metric: a fresh PR when there is one, otherwise the streak. */
    private fun drawHighlightMetric(canvas: Canvas, data: BragCardData) {
        val titlePaint = labelPaint()
        val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#00F2FE")
            textSize = 80f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }

        if (data.recentPr != null) {
            canvas.drawText("NEW PERSONAL RECORD", 140f, 570f, titlePaint)
            canvas.drawText(data.recentPr, 140f, 660f, valuePaint)
        } else {
            canvas.drawText("CONSISTENCY STREAK", 140f, 570f, titlePaint)
            canvas.drawText("${data.consistencyDays} DAYS ACTIVE", 140f, 660f, valuePaint)
        }
    }

    /** 7. Sessions / adaptation / athlete-name rows. */
    private fun drawStatGrid(canvas: Canvas, data: BragCardData) {
        val titlePaint = labelPaint()
        val statValuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 64f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }

        canvas.drawText("WORKOUTS LOGGED", 140f, 800f, titlePaint)
        canvas.drawText("${data.totalWorkouts} Sessions", 140f, 880f, statValuePaint)

        canvas.drawText("METABOLIC ADAPTATION", 140f, 1000f, titlePaint)
        canvas.drawText("Active & Calibrated", 140f, 1080f, statValuePaint)

        canvas.drawText("ATHLETE NAME", 140f, 1200f, titlePaint)
        canvas.drawText(data.userDisplayName.ifBlank { "AquaZero Athlete" }, 140f, 1280f, statValuePaint)
    }

    /** 8. Footer call-to-action, centre-aligned. */
    private fun drawFooter(canvas: Canvas) {
        val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#8892B0")
            textSize = 34f
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText(
            "Track with me on AquaZeroFit · t.me/AquaZeroFitBot",
            STORY_WIDTH / 2f,
            1600f,
            footerPaint,
        )
    }

    /** The muted small-caps label used above every stat value. */
    private fun labelPaint(): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#8892B0")
        textSize = 32f
        typeface = Typeface.DEFAULT
    }

    /**
     * Save story bitmap to application cache and generate an image share intent.
     */
    fun createStoryImageShareIntent(
        context: Context,
        data: BragCardData,
        inviteUrl: String = "https://t.me/AquaZeroFitBot",
    ): Intent {
        val bitmap = renderStoryCard(data)
        val shareDir = File(context.cacheDir, "share").apply { mkdirs() }
        val shareFile = File(shareDir, "aquazero_milestone.png")

        FileOutputStream(shareFile).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            shareFile,
        )

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, BragCardGenerator.formatShareText(data, inviteUrl))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        return Intent.createChooser(shareIntent, "Share Milestone Story")
    }
}
