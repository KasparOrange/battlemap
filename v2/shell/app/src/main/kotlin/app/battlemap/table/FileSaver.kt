package app.battlemap.table

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Saves files the page makes (a game export, a log) into the device's Downloads folder — the
 * WebView can't download `blob:` URLs itself, so the page streams the bytes over the bridge:
 * `saveBegin(name, mime)` → id, `saveChunk(id, base64)` × n, `saveEnd(id)`. The app's
 * `saveFile(blob, name)` (`app/src/lib/shell.ts`) does exactly that; a plain
 * `<a download href="blob:…">` click is caught by the WebView's download listener and sent the
 * same way (`MainActivity.BLOB_SCRIPT`). Progress and the result come as `download` events.
 *
 * Android 10+: MediaStore `Downloads` (visible in the Files app, no permission). Android 8–9:
 * the app's own external `Download` folder (no permission either; shown in the event's `where`).
 */
class FileSaver(private val context: Context) {
    private class Pending(val name: String, val mime: String, val temp: File, val out: FileOutputStream) {
        var bytes = 0L
    }

    private val pending = ConcurrentHashMap<Int, Pending>()
    private val nextId = AtomicInteger(1)

    /**
     * Starts a file called [name] of type [mime].
     *
     * @return the id for [chunk] and [end].
     */
    fun begin(name: String, mime: String): Int {
        val id = nextId.getAndIncrement()
        val safe = name.replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1f]"), "_").take(120).ifBlank { "battlemap-download" }
        val temp = File(context.cacheDir, "save-$id.part")
        pending[id] = Pending(safe, mime.ifBlank { "application/octet-stream" }, temp, FileOutputStream(temp))
        ShellLog.info("save $safe ($mime) started")
        PageEvents.emit("download", JSONObject().put("id", id).put("state", "started").put("name", safe))
        return id
    }

    /** Appends a base64 [data] chunk to the file [id]. False when [id] is unknown or the write failed. */
    fun chunk(id: Int, data: String): Boolean {
        val p = pending[id] ?: return false
        return try {
            val bytes = Base64.decode(data, Base64.DEFAULT)
            p.out.write(bytes)
            p.bytes += bytes.size
            true
        } catch (e: Exception) {
            ShellLog.error("save ${p.name}: write failed", e)
            abort(id)
            false
        }
    }

    /** Finishes the file [id]: moves it into Downloads. Emits `download` saved/failed. */
    fun end(id: Int): Boolean {
        val p = pending.remove(id) ?: return false
        return try {
            p.out.close()
            val where = publish(p)
            ShellLog.info("saved ${p.name} (${p.bytes} bytes) to $where")
            PageEvents.emit(
                "download",
                JSONObject().put("id", id).put("state", "saved").put("name", p.name).put("bytes", p.bytes).put("where", where),
            )
            true
        } catch (e: Exception) {
            ShellLog.error("save ${p.name} failed", e)
            PageEvents.emit("download", JSONObject().put("id", id).put("state", "failed").put("name", p.name).put("error", e.message ?: "failed"))
            false
        } finally {
            p.temp.delete()
        }
    }

    /** Drops the unfinished file [id]. */
    fun abort(id: Int) {
        val p = pending.remove(id) ?: return
        runCatching { p.out.close() }
        p.temp.delete()
        PageEvents.emit("download", JSONObject().put("id", id).put("state", "failed").put("name", p.name).put("error", "aborted"))
    }

    private fun publish(p: Pending): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, p.name)
                put(MediaStore.Downloads.MIME_TYPE, p.mime)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("MediaStore refused the download")
            resolver.openOutputStream(uri)?.use { out -> p.temp.inputStream().use { it.copyTo(out) } }
                ?: error("MediaStore gave no output stream")
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return "Downloads/${p.name}"
        }
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        val target = File(dir, p.name)
        p.temp.copyTo(target, overwrite = true)
        return target.absolutePath
    }
}
