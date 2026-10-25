package app.battlemap.table

import android.content.Context
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The table server inside the shell: the Rust server (`v2/server-rs`) running in this process
 * so the TV box itself hosts the table for LAN play — no internet needed. Process-wide; owned
 * by [TableService] (a foreground service, so the table stays up while the WebView reloads).
 *
 * Folders (all in the app's private storage):
 * - `files/server/data` — the server's data: files, shared library, game backups;
 * - `files/server/app` — the web app it serves to browser companions (`http://<box>:5930/app/`):
 *   the active downloaded bundle, else a copy of the APK's built-in one (made once per install);
 * - `files/server/state/logs` — the server's daily log files (mwlog, 7 kept).
 *
 * Memory caps for the 2 GB box: `LOSSLESS_MAX_PIXELS` 8 MP (libwebp lossless needs ~40 B per
 * pixel), `MAX_PIXELS` 64 MP, one picture job at a time, two worker threads.
 * Its log lines are drained every 2 s into [ShellLog] (→ the page → MwLog, `src=shell`).
 *
 * See v2/docs/shell.md "Table server" and v2/docs/server-rs.md "Embedded in the shell".
 */
object TableServer {
    /** The port the table listens on, on every interface (the box's Wi-Fi/Ethernet address). */
    const val PORT = 5930

    private val lock = Any()

    @Volatile
    private var port = 0

    @Volatile
    private var error: String? = null

    @Volatile
    private var startedAt = 0L

    @Volatile
    private var startMs = 0L

    @Volatile
    private var upstream: String? = null

    private var pump: Thread? = null

    /** Why the last start failed, or null. */
    val lastError: String? get() = error

    /** True while the server listens. */
    val running: Boolean get() = port != 0

    /** The local URL for pages on this device (`http://127.0.0.1:5930`), or null when not running. */
    val localUrl: String? get() = if (port != 0) "http://127.0.0.1:$port" else null

    /**
     * Starts the server (blocking — call off the main thread). Does nothing when it already runs.
     *
     * @param upstreamUrl the internet server (the VPS) the table mirrors its library from, pulls
     *   missing files from and forwards log batches to while online; null = none.
     * @return true when it runs afterwards.
     */
    fun start(context: Context, upstreamUrl: String?): Boolean = synchronized(lock) {
        if (port != 0) return true
        ServerBridge.loadError?.let {
            error = "the server library is missing: $it"
            ShellLog.error("table server: $error")
            return false
        }
        val t0 = SystemClock.elapsedRealtime()
        val root = File(context.filesDir, "server")
        val appDir = try {
            prepareAppDir(context, root)
        } catch (e: Exception) {
            ShellLog.warn("table server: no web app for browser companions", e)
            File(root, "app").apply { mkdirs() }
        }
        val settings = buildString {
            appendLine("PORT=$PORT")
            appendLine("HOST=0.0.0.0")
            appendLine("DATA_DIR=${File(root, "data").absolutePath}")
            appendLine("APP_DIR=${appDir.absolutePath}")
            appendLine("STATE_DIR=${File(root, "state").absolutePath}")
            appendLine("HOME=${context.filesDir.absolutePath}")
            appendLine("LOSSLESS_MAX_PIXELS=8000000")
            appendLine("MAX_PIXELS=64000000")
            appendLine("IMAGE_SLOTS=1")
            appendLine("FETCH_SLOTS=2")
            appendLine("WORKER_THREADS=2")
            appendLine("BUILD_POLL_MS=0")
            appendLine("BATTLEMAP_SERVER_BUILD=shell-${BuildConfig.VERSION_NAME}")
            if (upstreamUrl != null) appendLine("UPSTREAM_URL=$upstreamUrl")
        }
        val answer = runCatching { JSONObject(ServerBridge.nativeStart(settings)) }
            .getOrElse { JSONObject().put("ok", false).put("error", it.message) }
        drainLogs()
        if (!answer.optBoolean("ok")) {
            error = answer.optString("error", "start failed")
            ShellLog.error("table server could not start: $error")
            return false
        }
        port = answer.getInt("port")
        error = null
        upstream = upstreamUrl
        startedAt = System.currentTimeMillis()
        startMs = SystemClock.elapsedRealtime() - t0
        ShellLog.info("table server listening on port $port (${startMs} ms, upstream ${upstreamUrl ?: "none"}, rss ${rssKb()} kB)")
        startPump()
        true
    }

    /** Stops the server gracefully (blocking, at most ~5 s). */
    fun stop(reason: String) = synchronized(lock) {
        if (port == 0) return
        ShellLog.info("table server stopping ($reason)")
        runCatching { ServerBridge.nativeStop(3_000) }.onFailure { ShellLog.error("table server stop failed", it) }
        port = 0
        pump?.interrupt()
        pump = null
        drainLogs()
    }

    /** `{running, port, localUrl, upstream, error, startedAt, startMs, rssKb}` for `lan()`. */
    fun status(): JSONObject = JSONObject()
        .put("running", running)
        .put("port", if (port != 0) port else PORT)
        .put("localUrl", localUrl ?: JSONObject.NULL)
        .put("upstream", upstream ?: JSONObject.NULL)
        .put("error", error ?: JSONObject.NULL)
        .put("startedAt", startedAt)
        .put("startMs", startMs)
        .put("rssKb", rssKb())

    /** This process's resident memory (WebView host + server; the WebView renderer is its own process). */
    fun rssKb(): Long = runCatching {
        File("/proc/self/status").readLines().first { it.startsWith("VmRSS:") }
            .filter { it.isDigit() }.toLong()
    }.getOrDefault(-1)

    private fun startPump() {
        pump = Thread({
            try {
                while (!Thread.currentThread().isInterrupted) {
                    Thread.sleep(2_000)
                    drainLogs()
                }
            } catch (_: InterruptedException) {
            }
        }, "table-server-logs").apply { isDaemon = true; start() }
    }

    private fun drainLogs() {
        val lines = runCatching { JSONArray(ServerBridge.nativeTakeLogs()) }.getOrNull() ?: return
        for (i in 0 until lines.length()) {
            val l = lines.optJSONObject(i) ?: continue
            ShellLog.fromServer(l.optString("level", "info"), l.optString("msg"), l.optLong("t"))
        }
    }

    /**
     * The web app the server hands to browser companions: the active downloaded bundle as is,
     * else the APK's built-in `assets/app/`, copied once per install (~35 MB with the effects).
     */
    private fun prepareAppDir(context: Context, root: File): File {
        BundleStore(context).activeDir()?.let { return it }
        val dir = File(root, "app")
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        val marker = "${BuildConfig.VERSION_CODE}-${info.lastUpdateTime}"
        val stamp = File(root, "app.version")
        if (stamp.isFile && stamp.readText() == marker && File(dir, "index.html").isFile) return dir
        val t0 = SystemClock.elapsedRealtime()
        dir.deleteRecursively()
        var files = 0
        var bytes = 0L
        fun copy(asset: String, target: File) {
            val children = context.assets.list(asset) ?: emptyArray()
            if (children.isEmpty()) {
                target.parentFile?.mkdirs()
                context.assets.open(asset).use { input -> target.outputStream().use { bytes += input.copyTo(it) } }
                files++
            } else {
                for (c in children) copy("$asset/$c", File(target, c))
            }
        }
        copy("app", dir)
        stamp.writeText(marker)
        ShellLog.info("table server: copied the built-in app for browser companions ($files files, ${bytes / 1024 / 1024} MB, ${SystemClock.elapsedRealtime() - t0} ms)")
        return dir
    }
}
