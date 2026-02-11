package expo.modules.equitysms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

/**
 * BroadcastReceiver for incoming SMS messages.
 * LOGS EVERY SMS for debugging, then filters for allowed senders.
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EquitySmsReceiver"
        
        // Allowed sender addresses (case-insensitive matching)
        private val ALLOWED_SENDERS = listOf(
            "pjeykrs2",        // Testing sender
            "Equity Bank",     // Production sender
            "EQUITYBANK",      // Alternative format
            "EQUITY BANK",     // Alternative format with space
            "EquityBank"       // Another variation
        )
        
        // Listener for SMS events - set by SmsListenerService
        var smsListener: SmsListener? = null
    }

    interface SmsListener {
        fun onSmsReceived(transaction: TransactionData)
        fun onSmsError(error: String)
    }

    override fun onReceive(context: Context, intent: Intent) {
        // LOG IMMEDIATELY - before any checks
        Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.w(TAG, "▓▓▓  SMS RECEIVER TRIGGERED!              ▓▓▓")
        Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.w(TAG, "Intent: $intent")
        Log.w(TAG, "Action: ${intent.action}")
        Log.w(TAG, "Timestamp: ${System.currentTimeMillis()}")
        Log.w(TAG, "smsListener set: ${smsListener != null}")
        
        // Check action
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            Log.w(TAG, ">>> NOT SMS_RECEIVED_ACTION, got: ${intent.action}")
            return
        }
        
        Log.w(TAG, ">>> Action is SMS_RECEIVED_ACTION ✓")

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            Log.w(TAG, ">>> Number of SMS parts: ${messages.size}")
            
            if (messages.isEmpty()) {
                Log.e(TAG, ">>> NO MESSAGES IN INTENT!")
                return
            }
            
            // Concatenate multi-part SMS messages by sender
            // Equity Bank SMS can be >160 chars = 2+ parts
            val smsBySender = mutableMapOf<String, StringBuilder>()
            for (smsMessage in messages) {
                val sender = smsMessage.displayOriginatingAddress ?: "UNKNOWN"
                val body = smsMessage.messageBody ?: ""
                smsBySender.getOrPut(sender) { StringBuilder() }.append(body)
            }
            
            for ((sender, bodyBuilder) in smsBySender) {
                val body = bodyBuilder.toString()
                
                Log.w(TAG, "════════════════════════════════════════════")
                Log.w(TAG, ">>> FROM: $sender")
                Log.w(TAG, ">>> BODY (${body.length} chars): $body")
                Log.w(TAG, "════════════════════════════════════════════")
                
                val isAllowed = isAllowedSender(sender)
                Log.w(TAG, ">>> Sender '$sender' allowed: $isAllowed")
                
                if (isAllowed) {
                    Log.w(TAG, ">>> ✓ PROCESSING THIS SMS")
                    processEquitySms(context, body, sender)
                } else {
                    Log.w(TAG, ">>> ✗ SKIPPING - sender not in list: ${ALLOWED_SENDERS}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, ">>> EXCEPTION: ${e.message}")
            e.printStackTrace()
            smsListener?.onSmsError("Error: ${e.message}")
        }
        
        Log.w(TAG, "▓▓▓ END SMS RECEIVER ▓▓▓")
    }

    private fun isAllowedSender(sender: String): Boolean {
        for (allowed in ALLOWED_SENDERS) {
            if (sender.equals(allowed, ignoreCase = true)) {
                Log.w(TAG, ">>> Exact match: '$sender' == '$allowed'")
                return true
            }
            if (sender.contains(allowed, ignoreCase = true)) {
                Log.w(TAG, ">>> Contains match: '$sender' contains '$allowed'")
                return true
            }
        }
        Log.w(TAG, ">>> No match for sender: '$sender'")
        return false
    }

    private fun processEquitySms(context: Context, body: String, sender: String) {
        Log.w(TAG, ">>> processEquitySms called")
        
        Log.w(TAG, ">>> Calling SmsParser.parseEquityBankSms...")
        val transaction = SmsParser.parseEquityBankSms(body, sender)
        
        if (transaction != null) {
            Log.w(TAG, ">>> ✓ PARSED: ${transaction.id}")
            Log.w(TAG, ">>> Amount: ${transaction.amount}")
            
            // Forward to service listener if available (service → process → JS event)
            if (smsListener != null) {
                Log.w(TAG, ">>> Forwarding to smsListener (service is running)")
                smsListener?.onSmsReceived(transaction)
                Log.w(TAG, ">>> ✓ Forwarded to smsListener")
            } else {
                // Service NOT running — save locally as FALLBACK so SMS is never lost!
                Log.w(TAG, ">>> smsListener is NULL — saving locally as fallback!")
                try {
                    val localStore = LocalTransactionStore(context.applicationContext)
                    val saved = localStore.savePendingTransaction(transaction)
                    Log.w(TAG, ">>> Local fallback save result: $saved")
                } catch (e: Exception) {
                    Log.e(TAG, ">>> Local fallback save FAILED: ${e.message}")
                }
                
                // Try to start the service so future SMS get full processing
                ensureServiceRunning(context)
            }
        } else {
            Log.e(TAG, ">>> ✗ PARSE FAILED for body: ${body.take(200)}")
            smsListener?.onSmsError("Parse failed for SMS from $sender")
        }
    }

    /**
     * Starts the SMS listener service if it's not already running.
     * Called from receiver when service isn't active, so SMS processing continues.
     */
    private fun ensureServiceRunning(context: Context) {
        if (SmsListenerService.isServiceRunning) {
            Log.w(TAG, ">>> Service already running")
            return
        }
        
        try {
            Log.w(TAG, ">>> Starting service from receiver...")
            val serviceIntent = Intent(context, SmsListenerService::class.java).apply {
                putExtra("started_from_receiver", true)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
                Log.w(TAG, ">>> ✓ startForegroundService called")
            } else {
                context.startService(serviceIntent)
                Log.w(TAG, ">>> ✓ startService called")
            }
        } catch (e: Exception) {
            Log.e(TAG, ">>> ✗ Failed to start service from receiver: ${e.message}")
        }
    }
}
