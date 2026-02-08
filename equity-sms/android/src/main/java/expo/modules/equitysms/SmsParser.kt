package expo.modules.equitysms

import android.util.Log
import java.util.UUID
import java.util.regex.Pattern

/**
 * Utility class for parsing Equity Bank SMS messages.
 * 
 * Expected SMS format:
 * "Confirmed KES. 7,940.00 to GRACEWANGECHIMUREITHI A/C Ref.Number 11111 
 *  Via MPESA Ref UAGH013ERL6 by Dennis Ngumbi Agnes Phone 25479354525 
 *  on 10-01-2026 at 10:39.Thank you."
 */
object SmsParser {

    private const val TAG = "EquitySmsParser"

    // Regex pattern for parsing Equity Bank SMS
    // Captures: amount, recipient, account ref, payment method, mpesa ref, sender name, phone, date, time
    private val EQUITY_SMS_PATTERN = Pattern.compile(
        """Confirmed\s+([A-Z]{3})\.\s*([\d,]+\.?\d*)\s+to\s+([A-Z\s]+?)\s+A/C\s+Ref\.?Number\s+(\d+)\s+Via\s+(\w+)\s+Ref\s+(\w+)\s+by\s+(.+?)\s+Phone\s+(\d+)\s+on\s+(\d{2}-\d{2}-\d{4})\s+at\s+(\d{2}:\d{2})""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // Alternative pattern for slight format variations
    private val EQUITY_SMS_PATTERN_ALT = Pattern.compile(
        """Confirmed\s+([A-Z]{3})[.\s]*([\d,]+\.?\d*)\s+to\s+([A-Za-z\s]+)\s+A/?C\s*Ref\.?\s*Number\s*(\d+)\s+Via\s+(\w+)\s+Ref\s+([A-Z0-9]+)\s+by\s+(.+?)\s+Phone\s+(\d+)\s+on\s+(\d{2}-\d{2}-\d{4})\s+at\s+(\d{2}:\d{2})""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    /**
     * Parses an Equity Bank SMS message and extracts transaction details.
     * 
     * @param smsBody The SMS message body
     * @param smsSender The SMS sender address
     * @return TransactionData if parsing succeeds, null otherwise
     */
    fun parseEquityBankSms(smsBody: String, smsSender: String): TransactionData? {
        Log.d(TAG, "Attempting to parse SMS: $smsBody")

        // Try primary pattern first
        var matcher = EQUITY_SMS_PATTERN.matcher(smsBody)
        
        if (!matcher.find()) {
            // Try alternative pattern
            matcher = EQUITY_SMS_PATTERN_ALT.matcher(smsBody)
            if (!matcher.find()) {
                Log.w(TAG, "SMS does not match expected Equity Bank format")
                return null
            }
        }

        return try {
            val currency = matcher.group(1)?.trim()?.uppercase() ?: "KES"
            val amountStr = matcher.group(2)?.replace(",", "")?.trim() ?: "0"
            val amount = amountStr.toDoubleOrNull() ?: 0.0
            val recipientName = matcher.group(3)?.trim() ?: ""
            val accountReference = matcher.group(4)?.trim() ?: ""
            val paymentMethod = matcher.group(5)?.trim()?.uppercase() ?: ""
            val mpesaReference = matcher.group(6)?.trim() ?: ""
            val senderName = matcher.group(7)?.trim() ?: ""
            val senderPhone = matcher.group(8)?.trim() ?: ""
            val transactionDate = matcher.group(9)?.trim() ?: ""
            val transactionTime = matcher.group(10)?.trim() ?: ""

            TransactionData(
                id = generateTransactionId(mpesaReference, accountReference),
                amount = amount,
                currency = currency,
                recipientName = recipientName,
                accountReference = accountReference,
                mpesaReference = mpesaReference,
                paymentMethod = paymentMethod,
                senderName = senderName,
                senderPhone = senderPhone,
                transactionDate = transactionDate,
                transactionTime = transactionTime,
                rawMessage = smsBody,
                smsSender = smsSender,
                status = "confirmed",
                createdAt = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting data from SMS: ${e.message}")
            null
        }
    }

    /**
     * Generates a unique transaction ID based on references.
     */
    private fun generateTransactionId(mpesaRef: String, accountRef: String): String {
        val timestamp = System.currentTimeMillis()
        return "TXN_${mpesaRef}_${accountRef}_$timestamp"
    }

    /**
     * Validates if the SMS matches Equity Bank transaction format.
     */
    fun isEquityBankSms(smsBody: String): Boolean {
        return EQUITY_SMS_PATTERN.matcher(smsBody).find() ||
               EQUITY_SMS_PATTERN_ALT.matcher(smsBody).find()
    }

    /**
     * Extracts just the amount from the SMS for quick validation.
     */
    fun extractAmount(smsBody: String): Double? {
        val matcher = EQUITY_SMS_PATTERN.matcher(smsBody)
        if (matcher.find()) {
            val amountStr = matcher.group(2)?.replace(",", "")?.trim()
            return amountStr?.toDoubleOrNull()
        }
        return null
    }
}
