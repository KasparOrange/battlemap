package app.battlemap.table

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import androidx.webkit.WebViewCompat
import org.json.JSONObject

/**
 * What the shell runs on, detected once at start.
 *
 * @property isTv a TV device: Android TV / Google TV (leanback or TV UI mode) or Fire TV.
 * @property isFireTv an Amazon Fire TV (no Google Play services).
 * @property model the marketing-ish model string, e.g. "Xiaomi TV Box S 3rd Gen".
 */
class Device private constructor(
    val isTv: Boolean,
    val isFireTv: Boolean,
    val manufacturer: String,
    val model: String,
    val sdk: Int,
    val release: String,
    val webViewPackage: String,
    val webViewVersion: String,
) {
    /** The device part of `BattlemapShell.info()`. */
    fun toJson(): JSONObject = JSONObject()
        .put("manufacturer", manufacturer)
        .put("model", model)
        .put("sdk", sdk)
        .put("android", release)
        .put("isTv", isTv)
        .put("isFireTv", isFireTv)
        .put("webViewPackage", webViewPackage)
        .put("webViewVersion", webViewVersion)

    companion object {
        /** Detects the device [context] runs on. */
        fun detect(context: Context): Device {
            val pm = context.packageManager
            val fireTv = pm.hasSystemFeature("amazon.hardware.fire_tv")
            val ui = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
            val tv = fireTv ||
                ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
                pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
            val webView = WebViewCompat.getCurrentWebViewPackage(context)
            return Device(
                isTv = tv,
                isFireTv = fireTv,
                manufacturer = Build.MANUFACTURER,
                model = Build.MODEL,
                sdk = Build.VERSION.SDK_INT,
                release = Build.VERSION.RELEASE,
                webViewPackage = webView?.packageName ?: "unknown",
                webViewVersion = webView?.versionName ?: "unknown",
            )
        }
    }
}
