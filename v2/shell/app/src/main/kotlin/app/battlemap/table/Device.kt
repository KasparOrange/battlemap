package app.battlemap.table

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.provider.Settings
import androidx.webkit.WebViewCompat
import org.json.JSONObject

/**
 * What the shell runs on, detected once at start.
 *
 * @property isTv a TV device: Android TV / Google TV (leanback or TV UI mode) or Fire TV.
 * @property isFireTv an Amazon Fire TV (no Google Play services).
 * @property model the marketing-ish model string, e.g. "Xiaomi TV Box S 3rd Gen".
 * @property name the name the owner gave the device in Android's settings (Settings ▸ Device
 *   preferences ▸ About ▸ Device name on Google TV), else the Bluetooth name, else
 *   "<manufacturer> <model>" (qa#19).
 */
class Device private constructor(
    val isTv: Boolean,
    val isFireTv: Boolean,
    val manufacturer: String,
    val model: String,
    val name: String,
    val sdk: Int,
    val release: String,
    val webViewPackage: String,
    val webViewVersion: String,
) {
    /** The device part of `BattlemapShell.info()`. */
    fun toJson(): JSONObject = JSONObject()
        .put("manufacturer", manufacturer)
        .put("model", model)
        .put("name", name)
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
            val fallback = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
            return Device(
                isTv = tv,
                isFireTv = fireTv,
                manufacturer = Build.MANUFACTURER,
                model = Build.MODEL,
                name = friendlyName(context) ?: fallback,
                sdk = Build.VERSION.SDK_INT,
                release = Build.VERSION.RELEASE,
                webViewPackage = webView?.packageName ?: "unknown",
                webViewVersion = webView?.versionName ?: "unknown",
            )
        }

        /**
         * The device's own name: `Settings.Global.DEVICE_NAME` (what Google TV and most tablets
         * show in "About"), else `Settings.Secure` `bluetooth_name`. Null when neither is set
         * or the names are only the bare model string.
         */
        private fun friendlyName(context: Context): String? {
            val cr = context.contentResolver
            val candidates = listOf(
                runCatching { Settings.Global.getString(cr, Settings.Global.DEVICE_NAME) }.getOrNull(),
                runCatching { Settings.Secure.getString(cr, "bluetooth_name") }.getOrNull(),
            )
            return candidates.firstOrNull { !it.isNullOrBlank() && it != Build.MODEL }?.trim()
        }
    }
}
