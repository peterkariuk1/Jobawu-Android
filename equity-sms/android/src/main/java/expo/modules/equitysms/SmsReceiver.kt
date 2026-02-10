package expo.modules.equitysms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * BroadcastReceiver for incoming SMS messages.
 * 
 * Filters messages from allowed senders (pjeykrs2 for testing, Equity Bank for production)
 * and parses Equity Bank transaction SMS.
 * 
 * This receiver works independently of JavaScript - the app can be closed
 * and SMS will still be processed by the SmsListenerService.
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EquitySmsReceiver"
        
        // Allowed sender addresses (case-insensitive matching)
        // pjeykrs2 is used for testing, Equity Bank for production
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
        Log.i(TAG, "╔═══════════════════════════════════════════╗")
        Log.i(TAG, "║     SMS BROADCAST RECEIVED                ║")
        Log.i(TAG, "╚═══════════════════════════════════════════╝")
        Log.d(TAG, "Intent action: ${intent.action}")
        Log.d(TAG, "Timestamp: ${System.currentTimeMillis()}")
        
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            Log.d(TAG, "✗ Not an SMS_RECEIVED action, ignoring")
            return
        }

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            Log.d(TAG, "Number of SMS parts: ${messages.size}")
            
            for ((index, smsMessage) in messages.withIndex()) {
                val sender = smsMessage.displayOriginatingAddress ?: continue
                val body = smsMessage.messageBody ?: continue
                
                Log.d(TAG, "────────────────────────────────────────────")
                Log.d(TAG, "SMS Part ${index + 1}/${messages.size}")
                Log.d(TAG, "Sender: $sender")
                Log.d(TAG, "Body length: ${body.length} chars")
                Log.d(TAG, "Body preview: ${body.take(80)}...")
                
                // Check if sender is in allowed list (case-insensitive)
                if (isAllowedSender(sender)) {
                    Log.i(TAG, "✓ ALLOWED SENDER DETECTED - Processing SMS")
                    processEquitySms(body, sender)
                } else {
                    Log.d(TAG, "✗ Sender not in allowed list, ignoring")
                    Log.d(TAG, "Allowed: ${ALLOWED_SENDERS.joinToString(", ")}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "════════════════════════════════════════════")
            Log.e(TAG, "ERROR processing SMS: ${e.message}")
            Log.e(TAG, "Exception: ${e.javaClass.simpleName}")
            e.printStackTrace()
            Log.e(TAG, "════════════════════════════════════════════")
            smsListener?.onSmsError("Error processing SMS: ${e.message}")
        }
        
        Log.i(TAG, "══════════════════════════════════════════════")
    }

    private fun isAllowedSender(sender: String): Boolean {
        val matched = ALLOWED_SENDERS.any { allowed ->
            sender.equals(allowed, ignoreCase = true) ||
            sender.contains(allowed, ignoreCase = true)
        }
        Log.d(TAG, "isAllowedSender('$sender') = $matched")
        return matched
    }

    private fun processEquitySms(body: String, sender: String) {
        Log.d(TAG, "Parsing SMS from: $sender")
        
        // Check if listener is set
        if (smsListener == null) {
            Log.e(TAG, "════════════════════════════════════════════")
            Log.e(TAG, "✗ CRITICAL: smsListener is NULL!")
            Log.e(TAG, "SMS will NOT be processed.")
            Log.e(TAG, "This means SmsListenerService is not running.")
            Log.e(TAG, "════════════════════════════════════════════")
            return
        }
        
        try {
            val transaction = SmsParser.parseEquityBankSms(body, sender)
            
            if (transaction != null) {
                Log.i(TAG, "════════════════════════════════════════════")
                Log.i(TAG, "✓ PARSE SUCCESS")
                Log.i(TAG, "Transaction ID: ${transaction.id}")
                Log.i(TAG, "Amount: ${transaction.amount} ${transaction.currency}")
                Log.i(TAG, "MPESA Ref: ${transaction.mpesaReference}")
                Log.i(TAG, "Recipient: ${transaction.recipientName}")
                Log.i(TAG, "Sender: ${transaction.senderName}")
                Log.i(TAG, "════════════════════════════════════════════")
                
                Log.d(TAG, "Forwarding to smsListener...")
                smsListener?.onSmsReceived(transaction)
                Log.d(TAG, "✓ Transaction forwarded successfully")
            } else {
                Log.w(TAG, "════════════════════════════════════════════")
                Log.w(TAG, "✗ PARSE FAILED")
                Log.w(TAG, "SMS body did not match expected format")
                Log.w(TAG, "Body: $body")
                Log.w(TAG, "════════════════════════════════════════════")
                smsListener?.onSmsError("Failed to parse SMS format")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in processEquitySms: ${e.message}")
            e.printStackTrace()
            smsListener?.onSmsError("Error parsing SMS: ${e.message}")
        }
    }
}
