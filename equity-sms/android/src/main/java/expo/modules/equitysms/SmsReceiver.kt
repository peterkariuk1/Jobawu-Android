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
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            return
        }

        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            
            for (smsMessage in messages) {
                val sender = smsMessage.displayOriginatingAddress ?: continue
                val body = smsMessage.messageBody ?: continue
                
                Log.d(TAG, "SMS received from: $sender")
                
                // Check if sender is in allowed list (case-insensitive)
                if (isAllowedSender(sender)) {
                    Log.d(TAG, "Processing SMS from allowed sender: $sender")
                    processEquitySms(body, sender)
                } else {
                    Log.d(TAG, "Ignoring SMS from: $sender")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing SMS: ${e.message}")
            smsListener?.onSmsError("Error processing SMS: ${e.message}")
        }
    }

    private fun isAllowedSender(sender: String): Boolean {
        return ALLOWED_SENDERS.any { allowed ->
            sender.equals(allowed, ignoreCase = true) ||
            sender.contains(allowed, ignoreCase = true)
        }
    }

    private fun processEquitySms(body: String, sender: String) {
        try {
            val transaction = SmsParser.parseEquityBankSms(body, sender)
            if (transaction != null) {
                Log.d(TAG, "Successfully parsed transaction: $transaction")
                smsListener?.onSmsReceived(transaction)
            } else {
                Log.w(TAG, "Failed to parse SMS: $body")
                smsListener?.onSmsError("Failed to parse SMS format")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing SMS: ${e.message}")
            smsListener?.onSmsError("Error parsing SMS: ${e.message}")
        }
    }
}
