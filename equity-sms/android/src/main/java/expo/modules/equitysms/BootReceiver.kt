package expo.modules.equitysms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver that starts the SMS listener service on device boot.
 * Ensures the reconciliation service runs automatically after device restart.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EquitySmsBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON" ||
            intent.action == "com.htc.intent.action.QUICKBOOT_POWERON") {
            
            Log.d(TAG, "Boot completed, starting SMS listener service")
            
            try {
                // Start the foreground service for SMS listening
                val serviceIntent = Intent(context, SmsListenerService::class.java)
                context.startForegroundService(serviceIntent)
                Log.d(TAG, "SMS listener service started successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start SMS listener service: ${e.message}")
            }
        }
    }
}
