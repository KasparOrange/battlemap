package app.battlemap.table

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import org.json.JSONObject

/**
 * Sends shell events to the page: every event is a `CustomEvent('battlemapshell')` on
 * `window` whose `detail` is a JSON object with a `type` field (see docs/shell.md "events").
 *
 * The activity registers its current [WebView] with [attach]; events emitted while no page
 * is attached are dropped (log lines are buffered separately by [ShellLog]).
 * Safe to call from any thread — delivery always happens on the main thread.
 */
object PageEvents {
    /** The event name the page listens to. */
    const val EVENT = "battlemapshell"

    private val main = Handler(Looper.getMainLooper())

    @Volatile
    private var web: WebView? = null

    /** Makes [view] the target of all following events (null = no page). Main thread only. */
    fun attach(view: WebView?) {
        web = view
    }

    /**
     * Dispatches an event of [type] with the fields of [fields] to the page.
     *
     * @param type the `detail.type` value, e.g. `"apk"`, `"bundle"`, `"log"`, `"memory"`.
     * @param fields further `detail` fields; copied, so the caller may reuse the object.
     */
    fun emit(type: String, fields: JSONObject = JSONObject()) {
        val detail = JSONObject(fields.toString()).put("type", type)
        val script = "window.dispatchEvent(new CustomEvent('$EVENT',{detail:$detail}));"
        main.post { web?.evaluateJavascript(script, null) }
    }
}
