package app.battlemap.table

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import java.net.Inet4Address
import java.net.NetworkInterface
import org.json.JSONObject

/**
 * The table on the local network: this device's LAN address, the short code the TV shows for
 * it, and the status the page reads (`BattlemapShell.lan()`, `lan` events).
 *
 * **The code** (typed into a browser companion, or read off the TV): the box's IPv4 address in
 * Crockford base32 — 4 characters for the usual home range `192.168.x.y` (the last two
 * numbers), 7 for any other address; `-<port>` follows only when the port isn't 5930.
 * `app/src/lib/config.ts` (`decodeLanCode`) reads it back. Example: `192.168.1.42` → `"009A"`, `10.0.0.7` → `"0500007"`.
 */
object Lan {
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    /** Called (any thread) when hosting started or failed, so the activity can reload its page. */
    @Volatile
    var onHostChanged: (() -> Unit)? = null

    /** The device's IPv4 address on the LAN (Wi-Fi or Ethernet), or null when it has none. */
    fun address(context: Context): String? {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val props: LinkProperties? = cm?.activeNetwork?.let { cm.getLinkProperties(it) }
        props?.linkAddresses?.map { it.address }?.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
            ?.let { return it.hostAddress }
        return runCatching {
            NetworkInterface.getNetworkInterfaces().toList()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.inetAddresses.toList() }
                .firstOrNull { it is Inet4Address && it.isSiteLocalAddress }?.hostAddress
        }.getOrNull()
    }

    /** The short code for [ip] and [port] (see the class comment); null for a non-IPv4 text. */
    fun code(ip: String, port: Int): String? {
        val parts = ip.split('.').mapNotNull { it.toIntOrNull() }
        if (parts.size != 4 || parts.any { it !in 0..255 }) return null
        val value = parts.fold(0L) { acc, p -> (acc shl 8) or p.toLong() }
        val home = parts[0] == 192 && parts[1] == 168
        val (bits, chars) = if (home) (value and 0xFFFF) to 4 else value to 7
        val sb = StringBuilder()
        var v = bits
        repeat(chars) {
            sb.append(ALPHABET[(v and 31).toInt()])
            v = v shr 5
        }
        val text = sb.reverse().toString()
        return if (port == TableServer.PORT) text else "$text-$port"
    }

    /**
     * Everything the page shows about hosting: `{hosting, server: {running, port, …}, address,
     * url, code, tableId, joinUrl, announced}`. `joinUrl` opens the box's own copy of the app as
     * a companion of this table — what the TV's QR code holds.
     */
    fun status(context: Context): JSONObject {
        val settings = ShellSettings(context, Device.detect(context))
        val server = TableServer.status()
        val ip = address(context)
        val port = server.getInt("port")
        val url = ip?.let { "http://$it:$port" }
        val table = settings.tableId
        return JSONObject()
            .put("hosting", settings.hostTable)
            .put("server", server)
            .put("address", ip ?: JSONObject.NULL)
            .put("url", url ?: JSONObject.NULL)
            .put("code", ip?.let { code(it, port) } ?: JSONObject.NULL)
            .put("tableId", table)
            .put("tableName", settings.tableName ?: JSONObject.NULL)
            .put("joinUrl", url?.let { "$it/app/?mode=companion&table=${android.net.Uri.encode(table)}&server=${android.net.Uri.encode(it)}" } ?: JSONObject.NULL)
            .put("announced", LanAnnouncer.announcedName ?: JSONObject.NULL)
    }
}
