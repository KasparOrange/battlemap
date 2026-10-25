package app.battlemap.table

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * Keeps a TV box awake for a whole game night (parity TV-01). The window's keep-screen-on flag
 * isn't enough: Google TV's energy saver ("inattentive sleep", `secure attentive_timeout`, 4 h
 * on the Xiaomi box) counts only remote keys, and the screensaver/sleep timers run too.
 * The settings v1's deploy script wrote by adb (`../../docs/setup.md` "box asleep"):
 *
 * | Table | Setting | Value |
 * |---|---|---|
 * | secure | `attentive_timeout` | -1 (never) |
 * | secure | `sleep_timeout` | -1 |
 * | secure | `screensaver_enabled`, `screensaver_activate_on_sleep` | 0 |
 * | global | `stay_on_while_plugged_in` | 7 (AC, USB, wireless — the box is always on mains) |
 * | system | `screen_off_timeout` | Int.MAX_VALUE |
 *
 * Writing secure/global settings needs `WRITE_SECURE_SETTINGS`, which only adb can grant
 * (once per device): `adb shell pm grant app.battlemap.table android.permission.WRITE_SECURE_SETTINGS`.
 * With the grant the shell applies them at every TV-mode start; without it [status] says what is
 * missing. Changing *Energy saver* in the box's settings undoes them until the next start.
 * Not reachable from an app: HDMI-CEC "send standby on sleep" (`cmd hdmi_control`).
 */
object StayAwake {
    private data class Item(val table: String, val name: String, val value: Int)

    private val ITEMS = listOf(
        Item("secure", "attentive_timeout", -1),
        Item("secure", "sleep_timeout", -1),
        Item("secure", "screensaver_enabled", 0),
        Item("secure", "screensaver_activate_on_sleep", 0),
        Item("global", "stay_on_while_plugged_in", 7),
        Item("system", "screen_off_timeout", Int.MAX_VALUE),
    )

    /** True when adb granted `WRITE_SECURE_SETTINGS`. */
    fun granted(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED

    /**
     * Writes every setting that isn't already right.
     *
     * @return [status] after writing (`applied` lists what was changed this time).
     */
    fun apply(context: Context): JSONObject {
        val changed = JSONArray()
        if (!granted(context)) {
            ShellLog.info("stay awake: WRITE_SECURE_SETTINGS not granted — box settings left alone (adb pm grant, see docs/shell.md)")
            return status(context)
        }
        val cr = context.contentResolver
        for (item in ITEMS) {
            if (read(context, item) == item.value) continue
            val ok = runCatching {
                when (item.table) {
                    "secure" -> Settings.Secure.putInt(cr, item.name, item.value)
                    "global" -> Settings.Global.putInt(cr, item.name, item.value)
                    else -> Settings.System.putInt(cr, item.name, item.value)
                }
            }.onFailure { ShellLog.warn("stay awake: could not write ${item.table} ${item.name}", it) }.getOrDefault(false)
            if (ok) changed.put("${item.table} ${item.name}=${item.value}")
        }
        if (changed.length() > 0) ShellLog.info("stay awake: wrote $changed")
        return status(context).put("applied", changed)
    }

    /** `{granted, ok, settings: {"secure attentive_timeout": -1, …}, wrong: […]}`. */
    fun status(context: Context): JSONObject {
        val values = JSONObject()
        val wrong = JSONArray()
        for (item in ITEMS) {
            val key = "${item.table} ${item.name}"
            val v = read(context, item)
            values.put(key, v ?: JSONObject.NULL)
            if (v != item.value) wrong.put(key)
        }
        return JSONObject()
            .put("granted", granted(context))
            .put("ok", wrong.length() == 0)
            .put("settings", values)
            .put("wrong", wrong)
    }

    private fun read(context: Context, item: Item): Int? {
        val cr = context.contentResolver
        return runCatching {
            when (item.table) {
                "secure" -> Settings.Secure.getString(cr, item.name)
                "global" -> Settings.Global.getString(cr, item.name)
                else -> Settings.System.getString(cr, item.name)
            }?.toIntOrNull()
        }.getOrNull()
    }
}
