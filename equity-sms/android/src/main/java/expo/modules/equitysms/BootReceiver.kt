package expo.modules.equitysms

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * BroadcastReceiver that starts the SMS listener service on device boot.
 * Ensures the reconciliation service runs automatically after device restart.
 * Includes permission checks and comprehensive logging for debugging.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EquitySmsBootReceiver"
        private const val PREFS_NAME = "equity_sms_prefs"
        private const val KEY_SERVICE_ENABLED = "service_enabled"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        
        Log.d(TAG, "====== BOOT RECEIVER TRIGGERED ======")
        Log.d(TAG, "Received action: $action")
        Log.d(TAG, "Timestamp: ${System.currentTimeMillis()}")
        
        val validActions = listOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON"
        )
        
        if (action in validActions) {
            Log.d(TAG, "✓ Valid boot action detected")
            
            // Check if service was previously enabled
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val wasServiceEnabled = prefs.getBoolean(KEY_SERVICE_ENABLED, true) // Default to true
            Log.d(TAG, "Service was previously enabled: $wasServiceEnabled")
            
            // Check SMS permissions
            val hasSmsPermission = checkSmsPermissions(context)
            Log.d(TAG, "SMS permissions granted: $hasSmsPermission")
            
            if (!hasSmsPermission) {
                Log.w(TAG, "✗ SMS permissions not granted - cannot start service")
                Log.w(TAG, "Service will start when user grants permissions in the app")
                return
            }
            
            if (!wasServiceEnabled) {
                Log.d(TAG, "✗ Service was disabled by user - not auto-starting")
                return
            }
            
            try {
                Log.d(TAG, "Starting SMS listener service...")
                val serviceIntent = Intent(context, SmsListenerService::class.java).apply {
                    putExtra("started_from_boot", true)
                }
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                    Log.d(TAG, "✓ SUCCESS: startForegroundService() called (Android O+)")
                } else {
                    context.startService(serviceIntent)
                    Log.d(TAG, "✓ SUCCESS: startService() called (pre-Android O)")
                }
                
                // Log success for debugging
                Log.i(TAG, "====== BOOT SERVICE START SUCCESSFUL ======")
            } catch (e: Exception) {
                Log.e(TAG, "====== BOOT SERVICE START FAILED ======")
                Log.e(TAG, "Error: ${e.message}")
                Log.e(TAG, "Exception type: ${e.javaClass.simpleName}")
                e.printStackTrace()
            }
        } else {
            Log.d(TAG, "✗ Ignoring unhandled action: $action")
        }
        
        Log.d(TAG, "====== END BOOT RECEIVER ======")
    }

    private fun checkSmsPermissions(context: Context): Boolean {
        val receiveSms = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED
        
        val readSms = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
        
        Log.d(TAG, "Permission check - RECEIVE_SMS: $receiveSms, READ_SMS: $readSms")
        return receiveSms && readSms
    }
}
