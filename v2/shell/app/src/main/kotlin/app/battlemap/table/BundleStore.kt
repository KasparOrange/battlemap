package app.battlemap.table

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.util.zip.ZipInputStream

/**
 * The web app's files, served under [Origins.APP]: a downloaded bundle when one is active,
 * else the built-in one from the APK's `assets/app/`.
 *
 * Updating the web app = [install] a bundle zip from the server (unpacked to
 * `files/bundles/<id>/`), then reload the page. The origin stays the same, so IndexedDB/OPFS
 * data survives. The built-in bundle is the fallback: [useBuiltin], or automatically when a
 * downloaded bundle was loaded [MAX_UNCONFIRMED] times without the page calling
 * `BattlemapShell.ready()` (a broken update must not brick a TV that only has a remote).
 */
class BundleStore(private val context: Context) {
    private val root = File(context.filesDir, "bundles")
    private val prefs = context.getSharedPreferences("bundles", Context.MODE_PRIVATE)
    private val assets = WebViewAssetLoader.AssetsPathHandler(context)

    /** Cached handler for the active bundle's directory (rebuilt when the bundle changes). */
    private var activeHandler: Pair<File, WebViewAssetLoader.InternalStoragePathHandler>? = null

    /** The path handler to register for `/app/` on the asset loader. */
    val pathHandler = WebViewAssetLoader.PathHandler { path -> serve(path) }

    /** True when the APK carries a built-in web app (`assets/app/index.html`). */
    val hasBuiltin: Boolean by lazy {
        try {
            context.assets.open("app/index.html").close()
            true
        } catch (e: IOException) {
            false
        }
    }

    /** The built-in bundle's `build` from its `build.json` (written by the app's build), or null. */
    private val builtinBuild: String? by lazy {
        try {
            val text = context.assets.open("app/build.json").bufferedReader().use { it.readText() }
            JSONObject(text).optString("build").takeIf { it.isNotEmpty() }
        } catch (e: Exception) {
            null
        }
    }

    /** The active downloaded bundle's directory, or null when the built-in one is used. */
    @Synchronized
    fun activeDir(): File? {
        val rel = prefs.getString(KEY_ACTIVE, null) ?: return null
        val dir = File(root, rel)
        return if (File(dir, "index.html").isFile) dir else null
    }

    /** True when there is any web app to load (downloaded or built-in). */
    fun hasApp(): Boolean = activeDir() != null || hasBuiltin

    /** The bundle part of `BattlemapShell.info()`: source and version. */
    fun toJson(): JSONObject {
        val dir = activeDir()
        return when {
            dir != null -> JSONObject()
                .put("source", "downloaded")
                .put("version", prefs.getString(KEY_VERSION, "?"))
                .put("unconfirmedLoads", prefs.getInt(KEY_UNCONFIRMED, 0))
            hasBuiltin -> JSONObject()
                .put("source", "builtin")
                .put("version", builtinBuild ?: "shell ${BuildConfig.VERSION_NAME}")
            else -> JSONObject().put("source", "none")
        }
    }

    /**
     * Downloads the bundle zip at [url], unpacks it and makes it the active bundle.
     * The zip holds the app's `dist/` content (`index.html` at the top, or inside one folder).
     * Blocking — call off the main thread.
     *
     * @param version the version label the web app gives this bundle (shown in `info()`).
     * @param progress called with (bytes received, total or -1) during the download.
     * @throws IOException when the download fails or the zip holds no `index.html`.
     */
    fun install(url: String, version: String, progress: (Long, Long) -> Unit) {
        val id = "b" + System.currentTimeMillis()
        val zip = File(context.cacheDir, "bundle-$id.zip")
        val dir = File(root, id)
        try {
            Downloader.fetch(url, zip, progress)
            val files = unzip(zip, dir)
            val top = findIndexDir(dir) ?: throw IOException("bundle has no index.html")
            val rel = top.relativeTo(root).path
            synchronized(this) {
                prefs.edit()
                    .putString(KEY_ACTIVE, rel)
                    .putString(KEY_VERSION, version)
                    .putInt(KEY_UNCONFIRMED, 0)
                    .commit()
                activeHandler = null
            }
            pruneExcept(id)
            ShellLog.info("bundle $version installed ($files files) — active after the next reload")
        } catch (e: IOException) {
            dir.deleteRecursively()
            throw e
        } finally {
            zip.delete()
        }
    }

    /** Switches back to the built-in bundle and deletes downloaded ones. */
    fun useBuiltin(reason: String) {
        synchronized(this) {
            prefs.edit().remove(KEY_ACTIVE).remove(KEY_VERSION).putInt(KEY_UNCONFIRMED, 0).commit()
            activeHandler = null
        }
        pruneExcept(null)
        ShellLog.warn("using the built-in bundle again ($reason)")
    }

    /**
     * Called when the main frame starts loading [url]. Counts loads of a downloaded bundle
     * that the page has not confirmed yet.
     *
     * @return true when the bundle was just rolled back (the caller reloads).
     */
    fun noteLoad(url: String): Boolean {
        if (!url.startsWith(Origins.APP) || activeDir() == null) return false
        val count = prefs.getInt(KEY_UNCONFIRMED, 0) + 1
        prefs.edit().putInt(KEY_UNCONFIRMED, count).apply()
        if (count <= MAX_UNCONFIRMED) return false
        useBuiltin("downloaded bundle ${prefs.getString(KEY_VERSION, "?")} loaded $count× without ready()")
        return true
    }

    /** The page called `ready()`: the active bundle works. */
    fun confirm() {
        if (activeDir() == null) return
        if (prefs.getInt(KEY_UNCONFIRMED, 0) != 0) {
            prefs.edit().putInt(KEY_UNCONFIRMED, 0).apply()
            ShellLog.info("bundle ${prefs.getString(KEY_VERSION, "?")} confirmed by the page")
        }
    }

    private fun serve(path: String): WebResourceResponse {
        val file = if (path.isEmpty() || path.endsWith("/")) path + "index.html" else path
        open(file)?.let { return it }
        // Client-side routes (no file extension) get the app's index.html.
        if (!file.substringAfterLast('/').contains('.')) open("index.html")?.let { return it }
        return notFound()
    }

    /** Opens [file] from the active bundle, or from the built-in one; null when missing. */
    private fun open(file: String): WebResourceResponse? {
        val dir = activeDir()
        val response = if (dir != null) handlerFor(dir).handle(file) else assets.handle("app/$file")
        return response?.takeIf { it.data != null }
    }

    @Synchronized
    private fun handlerFor(dir: File): WebViewAssetLoader.InternalStoragePathHandler {
        val cached = activeHandler
        if (cached != null && cached.first == dir) return cached.second
        val handler = WebViewAssetLoader.InternalStoragePathHandler(context, dir)
        activeHandler = dir to handler
        return handler
    }

    private fun notFound() = WebResourceResponse(
        "text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)),
    )

    /** Unpacks [zip] into [dir], refusing entries that would land outside it. */
    private fun unzip(zip: File, dir: File): Int {
        dir.mkdirs()
        val base = dir.canonicalPath + File.separator
        var count = 0
        ZipInputStream(zip.inputStream().buffered()).use { zin ->
            while (true) {
                val entry = zin.nextEntry ?: break
                val out = File(dir, entry.name)
                if (!out.canonicalPath.startsWith(base)) throw IOException("bad zip entry ${entry.name}")
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zin.copyTo(it) }
                    count++
                }
            }
        }
        return count
    }

    /** The folder holding `index.html`: [dir] itself or its only subfolder. */
    private fun findIndexDir(dir: File): File? {
        if (File(dir, "index.html").isFile) return dir
        val children = dir.listFiles()?.filter { it.name != "__MACOSX" } ?: return null
        val only = children.singleOrNull()?.takeIf { it.isDirectory } ?: return null
        return only.takeIf { File(it, "index.html").isFile }
    }

    private fun pruneExcept(keepId: String?) {
        root.listFiles()?.forEach { if (it.name != keepId) it.deleteRecursively() }
    }

    companion object {
        /** Loads of a new bundle without `ready()` before it is rolled back. */
        const val MAX_UNCONFIRMED = 3

        private const val KEY_ACTIVE = "active"
        private const val KEY_VERSION = "version"
        private const val KEY_UNCONFIRMED = "unconfirmed"
    }
}
