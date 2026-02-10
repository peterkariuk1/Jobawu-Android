package expo.modules.equitysms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * BroadcastReceiver for incoming SMS messages.
 * Filters messages from allowed senders and parses Equity Bank transaction SMS.
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EquitySmsReceiver"
        
        // Allowed sender addresses (case-insensitive matching)
        private val ALLOWED_SENDERS = listOf(
            "pjeykrs2",      // Testing sender
            "Equity Bank",   // Production sender
            "EQUITYBANK",    // Alternative format
            "EQUITY BANK"    // Alternative format with space
        )
        
        // Listener for SMS events
        var smsListener: SmsListener? = null
    }

    interface SmsListener {
        fun onSmsReceived(transaction: TransactionData)
        fun onSmsError(error: String)
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "====== SMS BROADCAST RECEIVED ======")
        Log.d(TAG, "Intent action: ${intent.action}")
        
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            Log.d(TAG, "Not an SMS_RECEIVED action, ignoring")
            return
        }

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            Log.d(TAG, "Number of SMS messages in intent: ${messages.size}")
            
            for ((index, smsMessage) in messages.withIndex()) {
                val sender = smsMessage.displayOriginatingAddress ?: continue
                val body = smsMessage.messageBody ?: continue
                
                Log.d(TAG, "------- SMS #${index + 1} -------")
                Log.d(TAG, "Sender: $sender")
                Log.d(TAG, "Body length: ${body.length}")
                Log.d(TAG, "Body preview: ${body.take(100)}...")
                Log.d(TAG, "smsListener is null: ${smsListener == null}")
                
                // Check if sender is in allowed list (case-insensitive)
                if (isAllowedSender(sender)) {
                    Log.d(TAG, "✓ ALLOWED SENDER - Processing SMS")
                    processEquitySms(body, sender)
                } else {
                    Log.d(TAG, "✗ Not an allowed sender, ignoring")
                    Log.d(TAG, "Allowed senders: $ALLOWED_SENDERS")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing SMS: ${e.message}")
            e.printStackTrace()
            smsListener?.onSmsError("Error processing SMS: ${e.message}")
        }
        Log.d(TAG, "====== END SMS BROADCAST ======")
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
        try {
            Log.d(TAG, "Parsing SMS from $sender...")
            val transaction = SmsParser.parseEquityBankSms(body, sender)
            if (transaction != null) {
                Log.d(TAG, "✓ PARSE SUCCESS: ${transaction.id}")
                Log.d(TAG, "  Amount: ${transaction.amount}")
                Log.d(TAG, "  MPESA Ref: ${transaction.mpesaReference}")
                if (smsListener != null) {
                    Log.d(TAG, "Calling smsListener.onSmsReceived...")
                    smsListener?.onSmsReceived(transaction)
                    Log.d(TAG, "smsListener.onSmsReceived completed")
                } else {
                    Log.e(TAG, "✗ ERROR: smsListener is NULL - transaction won't be processed!")
                }
            } else {
                Log.w(TAG, "✗ PARSE FAILED - SMS body: $body")
                smsListener?.onSmsError("Failed to parse SMS format")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing SMS: ${e.message}")
            smsListener?.onSmsError("Error parsing SMS: ${e.message}")
        }
    }
}
