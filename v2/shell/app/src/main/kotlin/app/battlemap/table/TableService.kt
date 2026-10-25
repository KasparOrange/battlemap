package app.battlemap.table

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder

/**
 * The foreground service that owns the [TableServer]: it keeps the table up while the WebView
 * reloads, the screensaver runs or the activity is recreated, and keeps the process from being
 * the first one Android kills. Started by the activity (TV mode with hosting on) and by
 * [BootReceiver]; stopped by `ACTION_STOP` (hosting turned off).
 *
 * Also holds a Wi-Fi lock (the radio stays at full power while the table is hosted) and
 * announces the table on the LAN ([LanAnnouncer], mDNS `_battlemap._tcp`).
 */
class TableService : Service() {
    private var wifiLock: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Thread({
                LanAnnouncer.stop()
                TableServer.stop("hosting turned off")
                stopSelf()
            }, "table-stop").start()
            return START_NOT_STICKY
        }
        goForeground()
        val upstream = intent?.getStringExtra(EXTRA_UPSTREAM)
        Thread({
            if (TableServer.start(applicationContext, upstream)) {
                LanAnnouncer.start(applicationContext)
            }
            PageEvents.emit("lan", Lan.status(applicationContext))
            Lan.onHostChanged?.invoke()
        }, "table-start").start()
        return START_STICKY
    }

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Table server", NotificationManager.IMPORTANCE_LOW))
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("battlemap is hosting the table")
            .setContentText("Tablets on this Wi-Fi can join without internet")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION, n)
        if (wifiLock == null) {
            val wm = applicationContext.getSystemService(WifiManager::class.java)
            @Suppress("DEPRECATION")
            wifiLock = wm?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "battlemap-table")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    override fun onDestroy() {
        wifiLock?.release()
        wifiLock = null
        LanAnnouncer.stop()
        Thread({ TableServer.stop("service destroyed") }, "table-stop").start()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "table"
        private const val NOTIFICATION = 5930
        private const val ACTION_STOP = "app.battlemap.table.STOP_TABLE"
        private const val EXTRA_UPSTREAM = "upstream"

        /** Starts hosting when [ShellSettings.hostTable] says so (TV mode, hosting on). */
        fun startIfWanted(context: Context, settings: ShellSettings) {
            if (!settings.hostTable) return
            val intent = Intent(context, TableService::class.java).putExtra(EXTRA_UPSTREAM, settings.serverUrl)
            try {
                context.startForegroundService(intent)
            } catch (e: Exception) {
                ShellLog.warn("table server: the service could not start", e)
            }
        }

        /** Stops hosting (the server stops gracefully, the announcement ends). */
        fun stop(context: Context) {
            context.startService(Intent(context, TableService::class.java).setAction(ACTION_STOP))
        }
    }
}
