package app.battlemap.table

import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * `window.BattlemapShell` — what the web app can ask of the Android shell.
 * The typed contract is `v2/shell/bridge.d.ts`, explained in `v2/docs/shell.md`.
 *
 * Methods run on WebView's bridge thread: they only read thread-safe state and post
 * everything else to the main thread. Arguments and results are strings/booleans
 * (JSON where structured). Long jobs (APK, bundle) report through `battlemapshell` events.
 */
class ShellBridge(private val activity: MainActivity) {
    @Volatile
    private var bundleBusy = false

    /** Everything the page may want to know about the shell and device, as a JSON string. */
    @JavascriptInterface
    fun info(): String = activity.infoJson().toString()

    /** The page finished booting: confirms a freshly downloaded bundle as good. */
    @JavascriptInterface
    fun ready() {
        activity.bundles.confirm()
        ShellLog.info("page ready")
    }

    /** Returns buffered shell log lines (JSON array) and switches to live `log` events. */
    @JavascriptInterface
    fun takeLogs(): String = ShellLog.takeForPage().toString()

    /** Keeps the screen on (true) or lets it sleep (false). */
    @JavascriptInterface
    fun setKeepAwake(on: Boolean) = activity.runOnUiThread { activity.setKeepAwake(on) }

    /** Hides (true) or shows (false) the system bars. */
    @JavascriptInterface
    fun setImmersive(on: Boolean) = activity.runOnUiThread { activity.setImmersiveBars(on) }

    /**
     * Opens [url] outside the app (browser or the app that handles it).
     *
     * @return false when nothing on the device can open it (common on TV boxes).
     */
    @JavascriptInterface
    fun openExternal(url: String): Boolean = activity.openExternal(url)

    /** Downloads the APK at [url] and starts the system install (`apk` events). */
    @JavascriptInterface
    fun installApk(url: String) = ApkInstaller.start(activity, url)

    /**
     * Downloads the web bundle zip at [url] and makes it the active bundle (`bundle` events).
     * Takes effect on [reload].
     *
     * @param version the label the web app gives this bundle (shown in `info().bundle`).
     */
    @JavascriptInterface
    fun updateBundle(url: String, version: String) {
        if (bundleBusy) {
            PageEvents.emit("bundle", JSONObject().put("state", "failed").put("error", "a bundle update is already running"))
            return
        }
        bundleBusy = true
        Thread({
            try {
                ShellLog.info("bundle update: $version from $url")
                activity.bundles.install(url, version) { got, total ->
                    PageEvents.emit(
                        "bundle",
                        JSONObject().put("state", "downloading").put("received", got).put("total", total),
                    )
                }
                PageEvents.emit("bundle", JSONObject().put("state", "ready").put("version", version))
            } catch (e: Exception) {
                ShellLog.error("bundle update failed", e)
                PageEvents.emit(
                    "bundle",
                    JSONObject().put("state", "failed").put("error", e.message ?: e.javaClass.simpleName),
                )
            } finally {
                bundleBusy = false
            }
        }, "bundle-update").start()
    }

    /** Drops downloaded bundles and goes back to the one built into the APK (reloads). */
    @JavascriptInterface
    fun useBuiltinBundle() {
        activity.bundles.useBuiltin("asked by the page")
        activity.runOnUiThread { activity.loadStart() }
    }

    /** Reloads the start page (picks up a new bundle). */
    @JavascriptInterface
    fun reload() = activity.runOnUiThread { activity.loadStart() }

    /**
     * Loads the app from [url] (a dev server) from now on; "" or "off" goes back to the
     * bundle. Release builds accept local-network hosts only. Reloads when it changed.
     */
    @JavascriptInterface
    fun setDevUrl(url: String) {
        if (activity.settings.setDevUrl(url)) activity.runOnUiThread { activity.loadStart() }
    }

    /** Sets the server URL handed to the app as `server=` ("" = app default). Next load. */
    @JavascriptInterface
    fun setServerUrl(url: String) {
        activity.settings.setServerUrl(url)
    }

    /** Forces the start mode: "tv", "companion" or "auto". Takes effect on the next start. */
    @JavascriptInterface
    fun setStartMode(mode: String) {
        activity.settings.setStartMode(mode)
    }
}
