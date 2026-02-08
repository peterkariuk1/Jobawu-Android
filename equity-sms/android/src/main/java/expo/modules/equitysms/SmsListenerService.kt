package expo.modules.equitysms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the SMS listener running in the background.
 * This service registers the SmsReceiver and maintains a persistent notification
 * to ensure the app continues receiving SMS even when not in the foreground.
 */
class SmsListenerService : Service() {

    companion object {
        private const val TAG = "SmsListenerService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "equity_sms_channel"
        private const val CHANNEL_NAME = "Equity SMS Reconciliation"
    }

    private var smsReceiver: SmsReceiver? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "SmsListenerService created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "SmsListenerService started")
        
        // Start as foreground service with notification
        startForeground(NOTIFICATION_ID, createNotification())
        
        // Register SMS receiver programmatically for dynamic registration
        registerSmsReceiver()
        
        // Return START_STICKY to ensure the service restarts if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "SmsListenerService destroyed")
        unregisterSmsReceiver()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors incoming SMS for rent payment reconciliation"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        // Create an intent to open the app when notification is tapped
        val packageManager = packageManager
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jobawu SMS Reconciliation")
            .setContentText("Monitoring for rent payment notifications")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun registerSmsReceiver() {
        try {
            if (smsReceiver == null) {
                smsReceiver = SmsReceiver()
                val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
                    priority = IntentFilter.SYSTEM_HIGH_PRIORITY
                }
                registerReceiver(smsReceiver, filter)
                Log.d(TAG, "SMS receiver registered successfully")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register SMS receiver: ${e.message}")
        }
    }

    private fun unregisterSmsReceiver() {
        try {
            smsReceiver?.let {
                unregisterReceiver(it)
                smsReceiver = null
                Log.d(TAG, "SMS receiver unregistered successfully")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister SMS receiver: ${e.message}")
        }
    }
}
