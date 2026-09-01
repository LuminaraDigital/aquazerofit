package fit.aquazero.app.feature.settings

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDates
import java.io.File

/**
 * Hands the account data export to the system share sheet.
 *
 * The bundle goes out as a real `.json` file through the app's own
 * [FileProvider] rather than as intent text: an export of a full logging
 * history runs to megabytes, and a Binder transaction that large fails — often
 * by killing the process rather than by returning an error. The file lands in
 * `cache/exports`, so the OS reclaims it on its own if the user never saves it.
 *
 * Returns false when nothing on the device can receive the file, so the caller
 * can say so instead of appearing to have done something.
 */
fun Context.shareDataExport(json: String): Boolean {
    val file = runCatching { writeExportFile(json) }.getOrNull() ?: return false
    val uri = runCatching {
        FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
    }.getOrNull() ?: return false

    val send = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TITLE, file.name)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(send, getString(R.string.settings_export_share_title))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return runCatching {
        startActivity(chooser)
        true
    }.getOrDefault(false)
}

/**
 * Write the bundle to `cache/exports`, replacing any earlier export so the
 * cache never accumulates copies of a person's whole history.
 */
private fun Context.writeExportFile(json: String): File {
    val dir = File(cacheDir, "exports").apply {
        deleteRecursively()
        mkdirs()
    }
    val file = File(dir, "aquazerofit-export-${LocalDates.today()}.json")
    file.writeText(json)
    return file
}
