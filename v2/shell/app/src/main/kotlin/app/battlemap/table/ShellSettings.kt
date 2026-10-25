package app.battlemap.table

import android.content.Context
import android.content.Intent
import android.net.Uri

/** Where the shell serves its pages: one https origin, so IndexedDB, OPFS, workers work. */
object Origins {
    /** The asset loader's host (reserved by Android for exactly this use). */
    const val HOST = "appassets.androidplatform.net"

    /** The bundled web app (built-in or a downloaded bundle — same origin, same storage). */
    const val APP = "https://$HOST/app/"

    /** The shell's own pages: `index.html` (key log + checks) and `probe.html`. */
    const val SHELL = "https://$HOST/shell/"
}

/**
 * The shell's start settings: which mode (tv / companion), which URL to load, and the
 * developer overrides. Persisted in SharedPreferences `shell`, changed by intent extras
 * (adb `am start --es …`) or by the bridge (`BattlemapShell.setDevUrl`, `setStartMode`).
 *
 * Intent extras:
 * - `url` — load the web app from this URL instead of the bundle (persisted; `off` clears).
 * - `mode` — `tv`, `companion` or `auto` (persisted; auto = TV devices start as tv).
 * - `server` — the battlemap server's base URL handed to the app (persisted; `off` clears).
 * - `boot` — `on`/`off`: start into TV mode when the device boots (TV only, persisted).
 * - `host` — `on`/`off`: host the table on this device in TV mode (default on; persisted).
 * - `page` — one of the shell pages for this launch only: `probe`, `keys` (alias `home`);
 *   a query may follow, e.g. `probe?seconds=30`.
 */
class ShellSettings(context: Context, private val device: Device) {
    private val prefs = context.getSharedPreferences("shell", Context.MODE_PRIVATE)

    /** A shell page requested for this launch (not persisted), or null. */
    @Volatile
    var page: String? = null
        private set

    /** The developer URL the app is loaded from instead of the bundle, or null. */
    val devUrl: String? get() = prefs.getString(KEY_DEV_URL, null)

    /** The server base URL handed to the app as `server=`, or null (the app's own default). */
    val serverUrl: String? get() = prefs.getString(KEY_SERVER, null)

    /** A random id made on first start and kept: the app's `device=` (its table id on TV). */
    val deviceId: String by lazy {
        prefs.getString(KEY_DEVICE, null) ?: java.util.UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_DEVICE, it).apply()
        }
    }

    /**
     * Start into TV mode when the device boots (after a power cut the box would otherwise sit
     * on its home screen — parity TV-05). Opt-in, TV devices only; [BootReceiver] reads it.
     */
    val startOnBoot: Boolean get() = device.isTv && prefs.getBoolean(KEY_BOOT, false)

    /**
     * Turns [startOnBoot] on or off. Ignored (false) on devices that aren't TVs.
     *
     * @return true when the stored value changed.
     */
    fun setStartOnBoot(on: Boolean): Boolean {
        if (!device.isTv) {
            ShellLog.warn("start on boot is for TV devices only")
            return false
        }
        if (prefs.getBoolean(KEY_BOOT, false) == on) return false
        prefs.edit().putBoolean(KEY_BOOT, on).apply()
        ShellLog.info("start on boot ${if (on) "on" else "off"}")
        return true
    }

    /**
     * Host the table on this device (the Rust server in [TableService], LAN play without
     * internet): on by default in TV mode, never in companion mode.
     */
    val hostTable: Boolean get() = startMode == "tv" && prefs.getBoolean(KEY_HOST, true)

    /**
     * Turns hosting on or off (TV mode).
     *
     * @return true when the stored value changed.
     */
    fun setHostTable(on: Boolean): Boolean {
        if (prefs.getBoolean(KEY_HOST, true) == on) return false
        prefs.edit().putBoolean(KEY_HOST, on).apply()
        ShellLog.info("host the table on this device: ${if (on) "on" else "off"}")
        return true
    }

    /**
     * The table (relay room) this TV hosts: what the page announced ([setTable]), else the
     * app's own default for a new TV (`table-` + the first 8 characters of the device id, as
     * `app/src/lib/config.ts` makes it).
     */
    val tableId: String get() = prefs.getString(KEY_TABLE, null) ?: "table-${deviceId.take(8)}"

    /** The table's name as the page announced it, or null. */
    val tableName: String? get() = prefs.getString(KEY_TABLE_NAME, null)

    /**
     * Remembers the table id and name the TV page uses (for the LAN announcement).
     *
     * @return true when either changed.
     */
    fun setTable(id: String, name: String): Boolean {
        val cleanId = id.trim().take(64)
        val cleanName = name.trim().take(60)
        if (cleanId.isEmpty() || (cleanId == prefs.getString(KEY_TABLE, null) && cleanName == tableName)) return false
        prefs.edit().putString(KEY_TABLE, cleanId).putString(KEY_TABLE_NAME, cleanName.ifEmpty { null }).apply()
        ShellLog.info("table announced by the page: $cleanId ($cleanName)")
        return true
    }

    /** `tv` or `companion` when forced, null when automatic. */
    val modeOverride: String? get() = prefs.getString(KEY_MODE, null)

    /** The mode the web app should start in: the override, else `tv` on TV devices. */
    val startMode: String get() = modeOverride ?: if (device.isTv) "tv" else "companion"

    /**
     * Applies the extras of [intent] (see the class comment).
     *
     * @return true when something changed that needs a reload.
     */
    fun applyIntent(intent: Intent?): Boolean {
        val extras = intent?.extras ?: return false
        var changed = false
        extras.getString("url")?.let { changed = setDevUrl(it) || changed }
        extras.getString("mode")?.let { changed = setStartMode(it) || changed }
        extras.getString("server")?.let { changed = setServerUrl(it) || changed }
        extras.getString("host")?.let { changed = setHostTable(it == "on" || it == "true" || it == "1") || changed }
        extras.getString("boot")?.let { setStartOnBoot(it == "on" || it == "true" || it == "1") }
        extras.getString("page")?.let { requested ->
            if (pageUrl(requested) != null) {
                page = requested
                changed = true
            } else {
                ShellLog.warn("unknown page '$requested' (known: probe, keys)")
            }
        }
        return changed
    }

    /**
     * Sets or clears ([url] = "", "off" or "builtin") the developer URL.
     * Release builds accept only local-network hosts (see [isLocalHost]).
     *
     * @return true when the stored value changed.
     */
    fun setDevUrl(url: String): Boolean {
        val trimmed = url.trim()
        if (trimmed.isEmpty() || trimmed == "off" || trimmed == "builtin") {
            if (devUrl == null) return false
            prefs.edit().remove(KEY_DEV_URL).apply()
            ShellLog.info("dev url cleared — loading the bundled app again")
            return true
        }
        val uri = Uri.parse(trimmed)
        val okScheme = uri.scheme == "http" || uri.scheme == "https"
        val host = uri.host ?: ""
        if (!okScheme || host.isEmpty()) {
            ShellLog.warn("dev url rejected (not http/https): $trimmed")
            return false
        }
        if (!BuildConfig.DEBUG && !isLocalHost(host)) {
            ShellLog.warn("dev url rejected in a release build (not a local-network host): $trimmed")
            return false
        }
        if (trimmed == devUrl) return false
        prefs.edit().putString(KEY_DEV_URL, trimmed).apply()
        ShellLog.info("dev url set: $trimmed")
        return true
    }

    /**
     * Forces the start mode: `tv`, `companion`, or `auto` (clears the override).
     *
     * @return true when the stored value changed.
     */
    fun setStartMode(mode: String): Boolean {
        val value = when (mode.trim()) {
            "tv", "companion" -> mode.trim()
            "auto", "" -> null
            else -> {
                ShellLog.warn("unknown mode '$mode' (tv, companion, auto)")
                return false
            }
        }
        if (value == modeOverride) return false
        if (value == null) prefs.edit().remove(KEY_MODE).apply()
        else prefs.edit().putString(KEY_MODE, value).apply()
        ShellLog.info("start mode: ${value ?: "auto"} → $startMode")
        return true
    }

    /**
     * Sets or clears ([url] = "" or "off") the server URL handed to the app.
     *
     * @return true when the stored value changed.
     */
    fun setServerUrl(url: String): Boolean {
        val value = url.trim().takeUnless { it.isEmpty() || it == "off" }
        if (value != null && Uri.parse(value).scheme !in listOf("http", "https")) {
            ShellLog.warn("server url rejected (not http/https): $value")
            return false
        }
        if (value == serverUrl) return false
        if (value == null) prefs.edit().remove(KEY_SERVER).apply()
        else prefs.edit().putString(KEY_SERVER, value).apply()
        ShellLog.info("server url: ${value ?: "app default"}")
        return true
    }

    /**
     * Adds the app's start parameters to [url] — `mode`, `device` and, when set, `server`
     * (v2/docs/architecture.md "clients") — leaving any the URL already has. With [localServer]
     * (this TV hosts the table) `server` is that local URL and `upstream` the configured
     * internet server (backups, library while online).
     */
    fun withStartParams(url: String, localServer: String? = null): String {
        val uri = Uri.parse(url)
        val builder = uri.buildUpon()
        fun add(name: String, value: String?) {
            if (value != null && uri.getQueryParameter(name) == null) builder.appendQueryParameter(name, value)
        }
        add("mode", startMode)
        add("device", deviceId)
        if (localServer != null) {
            add("server", localServer)
            add("upstream", serverUrl)
        } else {
            add("server", serverUrl)
        }
        return builder.build().toString()
    }

    /** Forgets the one-shot page so the next load goes to the app again. */
    fun clearPage() {
        page = null
    }

    /** True when [url] may be shown inside the WebView (bundle origin or the dev URL's). */
    fun isTrustedUrl(url: Uri): Boolean {
        if (url.scheme == "https" && url.host == Origins.HOST) return true
        val dev = devUrl?.let(Uri::parse) ?: return false
        return url.scheme == dev.scheme && url.host == dev.host && url.port == dev.port
    }

    companion object {
        private const val KEY_DEV_URL = "devUrl"
        private const val KEY_MODE = "mode"
        private const val KEY_SERVER = "server"
        private const val KEY_DEVICE = "deviceId"
        private const val KEY_BOOT = "startOnBoot"
        private const val KEY_HOST = "hostTable"
        private const val KEY_TABLE = "tableId"
        private const val KEY_TABLE_NAME = "tableName"

        /**
         * Maps a page name (optionally with `?query`) to its URL on the shell origin.
         *
         * @return the URL, or null for an unknown page name.
         */
        fun pageUrl(page: String): String? {
            val name = page.substringBefore('?')
            val query = page.substringAfter('?', "")
            val file = when (name) {
                "probe" -> "probe.html"
                "keys", "home" -> "index.html"
                else -> return null
            }
            return Origins.SHELL + file + if (query.isEmpty()) "" else "?$query"
        }

        /**
         * True for hosts on the local network: localhost, private IPv4 ranges, Tailscale's
         * 100.64/10, link-local, `*.local` and `*.ts.net` names. No DNS lookup.
         */
        fun isLocalHost(host: String): Boolean {
            val h = host.lowercase()
            if (h == "localhost" || h.endsWith(".local") || h.endsWith(".ts.net")) return true
            val parts = h.split('.').mapNotNull { it.toIntOrNull() }
            if (parts.size != 4) return false
            val (a, b) = parts
            return a == 10 || a == 127 ||
                (a == 192 && b == 168) ||
                (a == 172 && b in 16..31) ||
                (a == 169 && b == 254) ||
                (a == 100 && b in 64..127)
        }
    }
}
