package app.battlemap.table

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * The shell's one logger. Every line goes to logcat (tag `battlemap`) and to the web app,
 * whose logger forwards it to MwLog with `src=shell`.
 *
 * Delivery to the page: lines are buffered (last [BUFFER_MAX]) until the page calls
 * `BattlemapShell.takeLogs()`; from then on each line is sent as a `log` event right away.
 * A new page load ([pageStarted]) switches back to buffering until that page asks again.
 */
object ShellLog {
    /** The logcat tag for everything the shell and the page's console write. */
    const val TAG = "battlemap"

    private const val BUFFER_MAX = 300

    private val lock = Any()
    private val buffer = ArrayDeque<JSONObject>()
    private var pageListening = false

    /** Logs a debug line (logcat + page). */
    fun debug(msg: String) = line("debug", msg, null)

    /** Logs an info line (logcat + page). */
    fun info(msg: String) = line("info", msg, null)

    /** Logs a warning, optionally with the exception that caused it. */
    fun warn(msg: String, err: Throwable? = null) = line("warn", msg, err)

    /** Logs an error, optionally with the exception that caused it. */
    fun error(msg: String, err: Throwable? = null) = line("error", msg, err)

    /**
     * Writes a line from the page's console to logcat only (never back to the page — the
     * page's own logger already has it). Lets `adb logcat -s battlemap` show both sides.
     */
    fun console(level: String, msg: String) {
        val text = "web: $msg"
        when (level) {
            "error" -> Log.e(TAG, text)
            "warn" -> Log.w(TAG, text)
            "debug" -> Log.d(TAG, text)
            else -> Log.i(TAG, text)
        }
    }

    /**
     * Hands the buffered lines to the page and switches to live `log` events.
     *
     * @return a JSON array of `{t, level, msg}` objects, oldest first.
     */
    fun takeForPage(): JSONArray = synchronized(lock) {
        val out = JSONArray()
        buffer.forEach { out.put(it) }
        buffer.clear()
        pageListening = true
        out
    }

    /** A new page started loading: buffer again until it calls `takeLogs()`. */
    fun pageStarted() = synchronized(lock) { pageListening = false }

    private fun line(level: String, msg: String, err: Throwable?) {
        val text = if (err != null) "$msg: ${err.javaClass.simpleName}: ${err.message}" else msg
        when (level) {
            "error" -> Log.e(TAG, text, err)
            "warn" -> Log.w(TAG, text, err)
            "debug" -> Log.d(TAG, text)
            else -> Log.i(TAG, text)
        }
        val entry = JSONObject()
            .put("t", System.currentTimeMillis())
            .put("level", level)
            .put("msg", text)
        val live = synchronized(lock) {
            if (!pageListening) {
                buffer.addLast(entry)
                while (buffer.size > BUFFER_MAX) buffer.removeFirst()
            }
            pageListening
        }
        if (live) PageEvents.emit("log", JSONObject().put("line", entry))
    }
}
