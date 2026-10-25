package app.battlemap.table

import android.app.ActivityOptions
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import androidx.core.content.IntentCompat
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * In-app APK updates: download the APK from a URL (progress as `apk` events), check it is
 * this app, hand it to the system's package installer. Android shows its install
 * confirmation; after the update Android kills the old process and starts the new version
 * with the installer's status intent (see [ACTION_STATUS]), so the app comes back by itself.
 *
 * Events (`detail.type == "apk"`), field `state`:
 * `downloading` (+ `received`, `total`) → `installing` → `waiting-for-user` → `done`,
 * or `failed` (+ `error`) at any point.
 */
object ApkInstaller {
    @Volatile
    private var busy = false

    /**
     * Starts an update from [url] on a background thread. Ignored (with a `failed` event)
     * while another update runs.
     */
    fun start(context: Context, url: String) {
        if (busy) {
            emit("failed", JSONObject().put("error", "an update is already running"))
            return
        }
        busy = true
        val app = context.applicationContext
        Thread({ run(app, url) }, "apk-update").start()
    }

    private fun run(context: Context, url: String) {
        val file = File(context.cacheDir, "update/battlemap.apk")
        try {
            ShellLog.info("apk update: downloading $url")
            Downloader.fetch(url, file) { got, total ->
                emit("downloading", JSONObject().put("received", got).put("total", total))
            }
            checkPackage(context, file)
            emit("installing")
            commit(context, file)
        } catch (e: Exception) {
            ShellLog.error("apk update failed", e)
            emit("failed", JSONObject().put("error", e.message ?: e.javaClass.simpleName))
            file.delete()
            busy = false
        }
    }

    /** Refuses an APK of another app; logs the version step. */
    private fun checkPackage(context: Context, file: File) {
        val pm = context.packageManager
        val archive = pm.getPackageArchiveInfo(file.path, 0)
            ?: throw IOException("not an APK (${file.length()} bytes)")
        if (archive.packageName != context.packageName) {
            throw IOException("APK is ${archive.packageName}, not ${context.packageName}")
        }
        val installed = pm.getPackageInfo(context.packageName, 0)
        ShellLog.info(
            "apk update: ${installed.versionName} (${installed.longVersionCodeCompat()}) → " +
                "${archive.versionName} (${archive.longVersionCodeCompat()}), " +
                "may install unknown apps: ${pm.canRequestPackageInstalls()}",
        )
    }

    private fun commit(context: Context, file: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("battlemap.apk", 0, file.length()).use { out ->
                file.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            // The status goes to MainActivity (not a receiver): after a self-update Android
            // starts the new version with it, so the app reopens instead of leaving the TV
            // on the launcher.
            val intent = Intent(context, MainActivity::class.java)
                .setAction(ACTION_STATUS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val options = if (Build.VERSION.SDK_INT >= 34) {
                ActivityOptions.makeBasic()
                    .setPendingIntentCreatorBackgroundActivityStartMode(
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED,
                    ).toBundle()
            } else {
                null
            }
            val pending = PendingIntent.getActivity(
                context, sessionId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE, options,
            )
            session.commit(pending.intentSender)
        }
        file.delete()
        ShellLog.info("apk update: session $sessionId committed")
    }

    /** The action of the status intents the installer sends to [MainActivity]. */
    const val ACTION_STATUS = "app.battlemap.table.INSTALL_STATUS"

    /** Called by [MainActivity] with an [ACTION_STATUS] intent from the installer. */
    fun onStatus(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
                ShellLog.info("apk update: waiting for the user to confirm")
                emit("waiting-for-user")
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    if (confirm != null) context.startActivity(confirm)
                } catch (e: Exception) {
                    ShellLog.error("apk update: cannot show the install confirmation", e)
                    emit("failed", JSONObject().put("error", "cannot show the install confirmation"))
                    busy = false
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                ShellLog.info("apk update: installed, running the new version")
                emit("done")
                busy = false
            }
            else -> {
                ShellLog.error("apk update: installer status $status: $message")
                emit("failed", JSONObject().put("error", message ?: "installer status $status"))
                busy = false
            }
        }
    }

    private fun emit(state: String, fields: JSONObject = JSONObject()) =
        PageEvents.emit("apk", fields.put("state", state))

    private fun android.content.pm.PackageInfo.longVersionCodeCompat(): Long =
        if (Build.VERSION.SDK_INT >= 28) longVersionCode else @Suppress("DEPRECATION") versionCode.toLong()
}
