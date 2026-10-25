package app.battlemap.table

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Starts the app in TV mode when the device has booted — only when the owner turned
 * [ShellSettings.startOnBoot] on (TV devices; parity TV-05: after a power cut the box sat on
 * its home screen and the table stayed dark until someone found the remote).
 *
 * Android 10+ lets an app start an activity from the background only with the overlay grant
 * (`appops set app.battlemap.table SYSTEM_ALERT_WINDOW allow`, which the APK updates need
 * anyway — docs/shell.md "Updates"); without it the start is blocked and logged by Android.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val device = Device.detect(context)
        val settings = ShellSettings(context, device)
        if (!settings.startOnBoot) {
            ShellLog.debug("boot completed — start on boot is off")
            return
        }
        ShellLog.info("boot completed — starting in TV mode")
        TableService.startIfWanted(context, settings)
        try {
            context.startActivity(
                Intent(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(MainActivity.EXTRA_BOOT, true),
            )
        } catch (e: Exception) {
            ShellLog.warn("start on boot: the activity start was refused", e)
        }
    }
}
