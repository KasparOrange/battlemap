package app.battlemap.table

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo

/**
 * Announces the hosted table on the LAN by mDNS/DNS-SD (Android's NSD): service type
 * `_battlemap._tcp`, named after the device (Android's device name), TXT attributes `table`
 * (the relay room), `name` (the table's name) and `v` (shell version). Android companions find
 * it with [LanDiscovery]; browsers can't browse mDNS and use the TV's code or QR instead.
 */
object LanAnnouncer {
    /** The DNS-SD service type of a battlemap table. */
    const val SERVICE_TYPE = "_battlemap._tcp"

    private var nsd: NsdManager? = null
    private var listener: NsdManager.RegistrationListener? = null

    /** The name Android registered (may get " (2)" appended on a clash), null when not announced. */
    @Volatile
    var announcedName: String? = null
        private set

    /** Registers the table (again, when the table id or name changed). Any thread. */
    @Synchronized
    fun start(context: Context) {
        stop()
        val port = TableServer.status().getInt("port")
        if (!TableServer.running) return
        val device = Device.detect(context)
        val settings = ShellSettings(context, device)
        val info = NsdServiceInfo().apply {
            serviceName = (settings.tableName ?: device.name).take(60)
            serviceType = SERVICE_TYPE
            setPort(port)
            setAttribute("table", settings.tableId)
            setAttribute("name", settings.tableName ?: device.name)
            setAttribute("v", BuildConfig.VERSION_NAME)
        }
        val l = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(s: NsdServiceInfo) {
                announcedName = s.serviceName
                ShellLog.info("lan: table announced as '${s.serviceName}' ($SERVICE_TYPE, port $port, table ${settings.tableId})")
                PageEvents.emit("lan", Lan.status(context))
            }

            override fun onRegistrationFailed(s: NsdServiceInfo, code: Int) {
                ShellLog.warn("lan: announcing the table failed (code $code)")
            }

            override fun onServiceUnregistered(s: NsdServiceInfo) {
                ShellLog.info("lan: announcement withdrawn")
            }

            override fun onUnregistrationFailed(s: NsdServiceInfo, code: Int) {
                ShellLog.warn("lan: withdrawing the announcement failed (code $code)")
            }
        }
        val manager = context.applicationContext.getSystemService(NsdManager::class.java) ?: return
        runCatching { manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, l) }
            .onFailure { ShellLog.warn("lan: NSD refused the announcement", it); return }
        nsd = manager
        listener = l
    }

    /** Withdraws the announcement. Any thread. */
    @Synchronized
    fun stop() {
        val l = listener ?: return
        runCatching { nsd?.unregisterService(l) }
        listener = null
        announcedName = null
    }
}
