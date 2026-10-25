package app.battlemap.table

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Plain HTTP(S) download to a file with progress callbacks. Blocking — call off the main thread. */
object Downloader {
    private const val PROGRESS_EVERY_MS = 250L

    /**
     * Downloads [url] into [dest] (through a `.part` file, so [dest] is either complete or
     * absent).
     *
     * @param progress called with (bytes received, total bytes or -1 when unknown), at most
     *   every 250 ms and once at the end.
     * @return the number of bytes written.
     * @throws IOException on a network error or a non-2xx HTTP status.
     */
    fun fetch(url: String, dest: File, progress: (Long, Long) -> Unit): Long {
        val started = System.currentTimeMillis()
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 30_000
        conn.instanceFollowRedirects = true
        try {
            val code = conn.responseCode
            if (code !in 200..299) throw IOException("HTTP $code for $url")
            val total = conn.contentLengthLong
            dest.parentFile?.mkdirs()
            val part = File(dest.path + ".part")
            var received = 0L
            var lastReport = 0L
            conn.inputStream.use { input ->
                FileOutputStream(part).use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        received += n
                        val now = System.currentTimeMillis()
                        if (now - lastReport >= PROGRESS_EVERY_MS) {
                            lastReport = now
                            progress(received, total)
                        }
                    }
                }
            }
            if (total >= 0 && received != total) {
                part.delete()
                throw IOException("short download: $received of $total bytes from $url")
            }
            dest.delete()
            if (!part.renameTo(dest)) throw IOException("cannot move ${part.name} to ${dest.name}")
            progress(received, total)
            ShellLog.info("downloaded $url: $received bytes in ${System.currentTimeMillis() - started} ms")
            return received
        } finally {
            conn.disconnect()
        }
    }
}
