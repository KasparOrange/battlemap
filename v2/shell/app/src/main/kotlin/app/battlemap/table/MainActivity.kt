package app.battlemap.table

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Display
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File

/**
 * The shell's only screen: a full-screen WebView running the web app.
 *
 * - Serves the bundled app on [Origins.APP] and the shell pages on [Origins.SHELL] through a
 *   [WebViewAssetLoader] (a real https origin: IndexedDB, OPFS, fetch, workers all work).
 * - Starts immersive; on TV also landscape and keep-screen-on (`tv` start mode).
 * - Back goes to the page first (cancelable `back` event), else history, else leaves.
 * - Recreates the WebView when its renderer process dies ([WebViewClient.onRenderProcessGone]).
 * - Exposes [ShellBridge] as `window.BattlemapShell`.
 *
 * See v2/docs/shell.md.
 */
class MainActivity : ComponentActivity() {
    /** The device the shell runs on. */
    lateinit var device: Device
        private set

    /** Start mode, dev URL and the one-shot page. */
    lateinit var settings: ShellSettings
        private set

    /** Saves the page's files (blob downloads) into Downloads. */
    lateinit var fileSaver: FileSaver
        private set

    /** The web app's files (built-in or downloaded bundle). */
    lateinit var bundles: BundleStore
        private set

    private lateinit var loader: WebViewAssetLoader
    private lateinit var root: FrameLayout
    private var web: WebView? = null
    private val main = Handler(Looper.getMainLooper())
    private val rendererLosses = ArrayDeque<Long>()
    private var backAsked = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    @Volatile
    private var immersive = true

    @Volatile
    private var keepAwake = false

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        val clips = data?.clipData
        val uris: Array<Uri>? = when {
            result.resultCode != RESULT_OK -> null
            clips != null -> Array(clips.itemCount) { clips.getItemAt(it).uri }
            else -> WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
        }
        ShellLog.info("file chooser: ${uris?.size ?: 0} file(s) picked")
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() = askPageForBack()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        device = Device.detect(this)
        settings = ShellSettings(this, device)
        bundles = BundleStore(this)
        fileSaver = FileSaver(this)
        ShellLog.info(
            "shell ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}${if (BuildConfig.DEBUG) ", debug" else ""}) " +
                "on ${device.manufacturer} ${device.model}, Android ${device.release} (sdk ${device.sdk}), " +
                "webview ${device.webViewVersion}, tv=${device.isTv}, fireTv=${device.isFireTv}",
        )
        settings.applyIntent(intent)
        if (intent?.getBooleanExtra(EXTRA_BOOT, false) == true) ShellLog.info("started after the device booted (start on boot)")
        if (device.isTv) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE

        val shellAssets = WebViewAssetLoader.AssetsPathHandler(this)
        loader = WebViewAssetLoader.Builder()
            .setDomain(Origins.HOST)
            .addPathHandler("/app/", bundles.pathHandler)
            .addPathHandler("/shell/") { path ->
                shellAssets.handle("shell/$path")?.takeIf { it.data != null } ?: notFound()
            }
            .build()

        WindowCompat.setDecorFitsSystemWindows(window, false)
        root = FrameLayout(this)
        root.setBackgroundColor(BACKGROUND)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val types = WindowInsetsCompat.Type.systemBars() or
                WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            val pad = insets.getInsets(types)
            view.setPadding(pad.left, pad.top, pad.right, pad.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        routeServiceWorkers()
        createWebView()
        web?.let(::trimHttpCacheOnTv)
        applyStartMode()
        onBackPressedDispatcher.addCallback(this, backCallback)
        loadStart()
        // Started by the installer after a self-update: log the result for the new page.
        if (intent?.action == ApkInstaller.ACTION_STATUS) ApkInstaller.onStatus(this, intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ApkInstaller.ACTION_STATUS) {
            ApkInstaller.onStatus(this, intent)
            return
        }
        setIntent(intent)
        val ours = intent.extras?.keySet()?.any { it in EXTRAS } == true
        if (!ours) return
        if (intent.getStringExtra("page") == null) settings.clearPage()
        settings.applyIntent(intent)
        applyStartMode()
        loadStart()
    }

    /** Loads the start page: the one-shot shell page, else the dev URL, else the bundled app. */
    fun loadStart() {
        val w = web ?: return
        val url = startUrl()
        ShellLog.pageStarted() // the old page is going: buffer lines for the new one
        ShellLog.info("loading $url (start mode ${settings.startMode})")
        w.loadUrl(url)
    }

    private fun startUrl(): String {
        settings.page?.let { page -> ShellSettings.pageUrl(page)?.let { return it } }
        settings.devUrl?.let { return settings.withStartParams(it) }
        if (bundles.hasApp()) return settings.withStartParams(Origins.APP + "index.html")
        return Origins.SHELL + "index.html?reason=no-app"
    }

    /**
     * Immersive always; keep-awake in TV mode only (the tablet's own timeout rules). TV mode on a
     * TV device also writes the box's stay-awake settings when adb granted the permission
     * ([StayAwake], parity TV-01).
     */
    private fun applyStartMode() {
        setImmersiveBars(true)
        val tv = settings.startMode == "tv"
        setKeepAwake(tv)
        if (tv && device.isTv) Thread({ StayAwake.apply(this) }, "stay-awake").start()
    }

    // ---- WebView ---------------------------------------------------------------------------

    private fun createWebView() {
        val w = WebView(this)
        w.setBackgroundColor(BACKGROUND)
        with(w.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            // The app (https origin) talks to http/ws servers on the LAN and the VPS.
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // The TV's font-size setting must not rescale the table.
            textZoom = 100
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            offscreenPreRaster = false
            userAgentString = "$userAgentString BattlemapShell/${BuildConfig.VERSION_NAME}"
        }
        w.isFocusable = true
        w.isFocusableInTouchMode = true
        w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
        w.addJavascriptInterface(ShellBridge(this), "BattlemapShell")
        w.webViewClient = ShellClient()
        w.webChromeClient = ShellChrome()
        w.setDownloadListener { url, _, contentDisposition, mime, _ -> onDownload(w, url, contentDisposition, mime) }
        root.addView(w, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        w.requestFocus()
        web = w
        PageEvents.attach(w)
    }

    /** Throws the WebView away and builds a new one (after its renderer died). */
    private fun recreateWebView() {
        val old = web ?: return
        PageEvents.attach(null)
        root.removeView(old)
        old.destroy()
        web = null
        val now = SystemClock.elapsedRealtime()
        rendererLosses.addLast(now)
        while (rendererLosses.isNotEmpty() && now - rendererLosses.first() > 60_000) rendererLosses.removeFirst()
        val delay = if (rendererLosses.size > 3) 5_000L else 0L
        if (delay > 0) ShellLog.warn("${rendererLosses.size} renderer losses within a minute — waiting 5 s")
        main.postDelayed({
            if (!isDestroyed) {
                createWebView()
                loadStart()
            }
        }, delay)
    }

    /** Lets a service worker's requests reach the asset loader too. */
    private fun routeServiceWorkers() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)
        ) return
        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
            override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        })
    }

    /** TV boxes have little storage and RAM: keep the WebView's HTTP cache under 64 MB. */
    private fun trimHttpCacheOnTv(w: WebView) {
        if (!device.isTv) return
        val size = File(cacheDir, "WebView").walkBottomUp().filter { it.isFile }.sumOf { it.length() }
        if (size > TV_HTTP_CACHE_MAX) {
            w.clearCache(true)
            ShellLog.info("webview cache was ${size / MB} MB (> ${TV_HTTP_CACHE_MAX / MB} MB) — cleared")
        } else {
            ShellLog.debug("webview cache ${size / MB} MB")
        }
    }

    private inner class ShellClient : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            loader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame || settings.isTrustedUrl(request.url)) return false
            ShellLog.info("navigation to ${request.url} leaves the app — opening it outside")
            openExternal(request.url.toString())
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            ShellLog.pageStarted()
            if (bundles.noteLoad(url)) main.post { loadStart() }
        }

        override fun onPageFinished(view: WebView, url: String) {
            ShellLog.debug("page loaded: $url")
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: android.webkit.WebResourceError,
        ) {
            if (request.isForMainFrame) {
                ShellLog.error("page failed to load: ${request.url}: ${error.errorCode} ${error.description}")
            }
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (request.isForMainFrame) {
                ShellLog.error("page HTTP ${response.statusCode}: ${request.url}")
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page is gone: keep this line for the next page instead of sending it nowhere.
            if (view === web) PageEvents.attach(null)
            ShellLog.pageStarted()
            ShellLog.error(
                "webview renderer gone (crashed=${detail.didCrash()}, " +
                    "priority at exit=${detail.rendererPriorityAtExit()}) — recreating the WebView",
            )
            if (view === web) {
                recreateWebView()
            } else {
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
            }
            return true
        }
    }

    private inner class ShellChrome : WebChromeClient() {
        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            val level = when (message.messageLevel()) {
                ConsoleMessage.MessageLevel.ERROR -> "error"
                ConsoleMessage.MessageLevel.WARNING -> "warn"
                ConsoleMessage.MessageLevel.DEBUG, ConsoleMessage.MessageLevel.TIP -> "debug"
                else -> "info"
            }
            val source = message.sourceId()?.substringAfterLast('/') ?: ""
            ShellLog.console(level, "${message.message()} ($source:${message.lineNumber()})")
            return true
        }

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                filePicker.launch(params.createIntent())
                true
            } catch (e: ActivityNotFoundException) {
                ShellLog.warn("no file picker on this device")
                fileCallback = null
                false
            }
        }
    }

    /**
     * A download the page started: a `blob:`/`data:` URL is read by the page itself and streamed
     * to [FileSaver] (WebView can't fetch blobs natively); an http(s) URL opens outside.
     */
    private fun onDownload(w: WebView, url: String, contentDisposition: String?, mime: String?) {
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            val name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mime)
                .let { if (it.startsWith("downloadfile") || it.isBlank()) "battlemap-download" else it }
            ShellLog.info("download of a ${url.substringBefore(':')} URL — streaming it as $name")
            w.evaluateJavascript(blobScript(url, name, mime ?: ""), null)
        } else {
            openExternal(url)
        }
    }

    // ---- Back and keys -----------------------------------------------------------------------

    /**
     * Back: the page gets a cancelable `back` event first; if it calls `preventDefault()` it
     * handled Back. Otherwise (or no answer in 500 ms): history back, else leave the app.
     */
    private fun askPageForBack() {
        val w = web ?: run { finish(); return }
        if (backAsked) return
        backAsked = true
        var settled = false
        val timeout = Runnable {
            if (!settled) {
                settled = true
                backAsked = false
                ShellLog.warn("back: no answer from the page within 500 ms")
                backFallback()
            }
        }
        main.postDelayed(timeout, 500)
        w.evaluateJavascript(BACK_SCRIPT) { result ->
            if (settled) return@evaluateJavascript
            settled = true
            backAsked = false
            main.removeCallbacks(timeout)
            if (result == "true") ShellLog.debug("back: handled by the page") else backFallback()
        }
    }

    private fun backFallback() {
        val w = web
        if (w != null && w.canGoBack()) {
            ShellLog.info("back: history back")
            w.goBack()
        } else {
            ShellLog.info("back: leaving the app")
            finish()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (BuildConfig.DEBUG && event.repeatCount == 0) {
            Log.d(ShellLog.TAG, "key ${KeyEvent.keyCodeToString(event.keyCode)} ${if (event.action == KeyEvent.ACTION_DOWN) "down" else "up"}")
        }
        // WebView drops the remote's Menu key (Fire TV's ☰); hand it to the page as the
        // standard DOM key "ContextMenu".
        if (event.keyCode == KeyEvent.KEYCODE_MENU && event.action != KeyEvent.ACTION_MULTIPLE) {
            val type = if (event.action == KeyEvent.ACTION_DOWN) "keydown" else "keyup"
            web?.evaluateJavascript(
                "(document.activeElement||document).dispatchEvent(new KeyboardEvent('$type'," +
                    "{key:'ContextMenu',code:'ContextMenu',bubbles:true,cancelable:true," +
                    "repeat:${event.repeatCount > 0}}))",
                null,
            )
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    // ---- Window state -------------------------------------------------------------------------

    /** Hides ([on]) or shows the system bars; a swipe from the edge shows them briefly. */
    fun setImmersiveBars(on: Boolean) {
        if (immersive != on) ShellLog.info("immersive ${if (on) "on" else "off"}")
        immersive = on
        applyImmersive()
    }

    private fun applyImmersive() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (immersive) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    /** Keeps the screen on ([on]) or lets the device's timeout apply. */
    fun setKeepAwake(on: Boolean) {
        if (keepAwake != on) ShellLog.info("keep awake ${if (on) "on" else "off"}")
        keepAwake = on
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /**
     * Opens [url] (http, https or mailto) outside the app.
     *
     * @return false when the scheme is not allowed or nothing on the device opens it.
     */
    fun openExternal(url: String): Boolean {
        val uri = Uri.parse(url)
        if (uri.scheme !in listOf("http", "https", "mailto")) {
            ShellLog.warn("openExternal refused (scheme ${uri.scheme}): $url")
            return false
        }
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            ShellLog.info("opened outside: $url")
            true
        } catch (e: ActivityNotFoundException) {
            ShellLog.warn("nothing on this device opens $url")
            false
        }
    }

    /** `BattlemapShell.info()`: shell, device, mode, bundle, display. Any thread. */
    fun infoJson(): JSONObject {
        val metrics = resources.displayMetrics
        val display = (getSystemService(DISPLAY_SERVICE) as DisplayManager).getDisplay(Display.DEFAULT_DISPLAY)
        val mode = display?.mode
        return JSONObject()
            .put("shellVersion", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("debug", BuildConfig.DEBUG)
            .put("applicationId", packageName)
            .put("isTv", device.isTv)
            .put("startMode", settings.startMode)
            .put("startModeForced", settings.modeOverride != null)
            .put("deviceId", settings.deviceId)
            .put("devUrl", settings.devUrl ?: JSONObject.NULL)
            .put("serverUrl", settings.serverUrl ?: JSONObject.NULL)
            .put("bundle", bundles.toJson())
            .put("immersive", immersive)
            .put("keepAwake", keepAwake)
            .put("startOnBoot", settings.startOnBoot)
            .put("stayAwake", StayAwake.status(this))
            .put("device", device.toJson())
            .put(
                "display",
                JSONObject()
                    .put("windowWidthPx", metrics.widthPixels)
                    .put("windowHeightPx", metrics.heightPixels)
                    .put("density", metrics.density.toDouble())
                    .put("modeWidthPx", mode?.physicalWidth ?: 0)
                    .put("modeHeightPx", mode?.physicalHeight ?: 0)
                    .put("refreshRate", (mode?.refreshRate ?: 0f).toDouble()),
            )
    }

    // ---- Lifecycle ------------------------------------------------------------------------------

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && immersive) applyImmersive()
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    override fun onPause() {
        web?.onPause()
        super.onPause()
    }

    /**
     * Android asks to free memory. Only real pressure reaches the page as a `memory` event
     * (review #3): `RUNNING_LOW` (10) and `RUNNING_CRITICAL` (15) while visible, `MODERATE` (60)
     * and `COMPLETE` (80) while in the background. `UI_HIDDEN` (20) — sent every time the app
     * merely goes to the background — and the mild levels 5 and 40 are logged only.
     */
    @Suppress("DEPRECATION")
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        val pressure = isMemoryPressure(level)
        ShellLog.info("trim memory, level $level${if (pressure) "" else " (not forwarded)"}")
        if (!pressure) return
        web?.clearCache(false)
        PageEvents.emit("memory", JSONObject().put("level", level))
    }

    override fun onDestroy() {
        PageEvents.attach(null)
        web?.let {
            root.removeView(it)
            it.destroy()
        }
        web = null
        super.onDestroy()
    }

    private fun notFound() = WebResourceResponse(
        "text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)),
    )

    companion object {
        /** Intent extra set by [BootReceiver]: this start came from the device booting. */
        const val EXTRA_BOOT = "app.battlemap.table.BOOT"

        /**
         * True for the trim levels that mean real memory pressure (see [onTrimMemory]).
         */
        @Suppress("DEPRECATION")
        fun isMemoryPressure(level: Int): Boolean =
            level == TRIM_MEMORY_RUNNING_LOW || level == TRIM_MEMORY_RUNNING_CRITICAL || level >= TRIM_MEMORY_MODERATE

        /** JS that reads a blob/data [url] and streams it to `BattlemapShell.saveChunk` (512 kB slices). */
        fun blobScript(url: String, name: String, mime: String): String {
            val q = { v: String -> JSONObject.quote(v) }
            return "(async function(){var S=window.BattlemapShell;var id=-1;try{" +
                "var b=await (await fetch(${q(url)})).blob();id=S.saveBegin(${q(name)},${q(mime)}||b.type||'');" +
                "for(var o=0;o<b.size;o+=524288){var u=new Uint8Array(await b.slice(o,o+524288).arrayBuffer());" +
                "var s='';for(var i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));" +
                "if(!S.saveChunk(id,btoa(s)))return;}S.saveEnd(id);}catch(e){if(id>=0)S.saveAbort(id);" +
                "console.error('blob download failed: '+e);}})()"
        }

        private val BACKGROUND = Color.parseColor("#0F1115")
        const val MB = 1024L * 1024L
        const val TV_HTTP_CACHE_MAX = 64 * MB
        val EXTRAS = setOf("url", "mode", "page", "server", "boot")

        /** Dispatches the cancelable `back` event; evaluates to true when the page handled it. */
        const val BACK_SCRIPT = "(function(){try{var e=new CustomEvent('battlemapshell'," +
            "{cancelable:true,detail:{type:'back'}});window.dispatchEvent(e);" +
            "return e.defaultPrevented;}catch(x){return false;}})()"
    }
}
