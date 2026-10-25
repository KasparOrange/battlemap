package app.battlemap.table

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque

/**
 * Finds hosted tables on the LAN (mDNS `_battlemap._tcp`, see [LanAnnouncer]) for a companion.
 * The page turns it on and off (`BattlemapShell.discoverTables(on)`); every change sends a
 * `tables` event with the whole list `[{service, table, name, host, port, url}]`.
 * Services are resolved one at a time (older Android versions refuse parallel resolves).
 */
object LanDiscovery {
    private var nsd: NsdManager? = null
    private var listener: NsdManager.DiscoveryListener? = null
    private val found = LinkedHashMap<String, JSONObject>()
    private val queue = ArrayDeque<NsdServiceInfo>()
    private var resolving = false

    /** The tables found so far, as a JSON array. */
    @Synchronized
    fun list(): JSONArray = JSONArray().apply { found.values.forEach { put(it) } }

    /** Starts browsing (no-op when already browsing). */
    @Synchronized
    fun start(context: Context) {
        if (listener != null) return
        val manager = context.applicationContext.getSystemService(NsdManager::class.java) ?: return
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(type: String) = ShellLog.info("lan: looking for tables ($type)")
            override fun onDiscoveryStopped(type: String) = ShellLog.info("lan: stopped looking for tables")
            override fun onStartDiscoveryFailed(type: String, code: Int) = ShellLog.warn("lan: discovery failed to start (code $code)")
            override fun onStopDiscoveryFailed(type: String, code: Int) = ShellLog.warn("lan: discovery failed to stop (code $code)")
            override fun onServiceFound(s: NsdServiceInfo) = enqueue(s)
            override fun onServiceLost(s: NsdServiceInfo) {
                synchronized(this@LanDiscovery) { found.remove(s.serviceName) }
                ShellLog.info("lan: table '${s.serviceName}' gone")
                emit()
            }
        }
        runCatching { manager.discoverServices(LanAnnouncer.SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, l) }
            .onFailure { ShellLog.warn("lan: NSD refused discovery", it); return }
        nsd = manager
        listener = l
    }

    /** Stops browsing; the list is kept until the next [start]. */
    @Synchronized
    fun stop() {
        val l = listener ?: return
        runCatching { nsd?.stopServiceDiscovery(l) }
        listener = null
        queue.clear()
        resolving = false
    }

    @Synchronized
    private fun enqueue(s: NsdServiceInfo) {
        queue.addLast(s)
        next()
    }

    @Synchronized
    private fun next() {
        if (resolving) return
        val s = queue.pollFirst() ?: return
        val manager = nsd ?: return
        resolving = true
        @Suppress("DEPRECATION")
        manager.resolveService(s, object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, code: Int) {
                ShellLog.warn("lan: could not resolve '${info.serviceName}' (code $code)")
                done()
            }

            override fun onServiceResolved(info: NsdServiceInfo) {
                @Suppress("DEPRECATION")
                val host = info.host?.hostAddress
                if (host != null) {
                    val attr = { k: String -> info.attributes[k]?.toString(Charsets.UTF_8) }
                    val url = "http://${if (host.contains(':')) "[$host]" else host}:${info.port}"
                    val entry = JSONObject()
                        .put("service", info.serviceName)
                        .put("table", attr("table") ?: JSONObject.NULL)
                        .put("name", attr("name") ?: info.serviceName)
                        .put("host", host)
                        .put("port", info.port)
                        .put("url", url)
                    synchronized(this@LanDiscovery) { found[info.serviceName] = entry }
                    ShellLog.info("lan: found table '${info.serviceName}' at $url (table ${attr("table")})")
                    emit()
                }
                done()
            }
        })
    }

    private fun done() {
        synchronized(this) { resolving = false }
        next()
    }

    private fun emit() = PageEvents.emit("tables", JSONObject().put("tables", list()))
}
