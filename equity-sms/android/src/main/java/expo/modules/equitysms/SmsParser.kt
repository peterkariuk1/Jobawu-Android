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
 * 
 * Alternative formats supported:
 * - "Confirmed KES 7940 to..." (without period/comma)
 * - "Confirmed KES.7,940.00 to..." (no space after period)
 */
object SmsParser {

    private const val TAG = "EquitySmsParser"

    // Equity Bank message signature patterns - trust template, not sender
    private val EQUITY_PATTERNS = listOf(
        "Confirmed KES",           // Equity sends messages with this format
        "MPESA Ref",               // MPESA reference always present
        "Ref.Number",              // Reference number format
        "Thank you."               // Equity's closing signature
    )

    // Primary regex pattern for Equity Bank SMS
    private val EQUITY_SMS_PATTERN = Pattern.compile(
        """Confirmed\s+([A-Z]{3})[\.\s]*([\d,]+\.?\d*)\s+to\s+([A-Za-z\s]+?)\s+A/?C\s*Ref\.?\s*Number\s*(\d+)\s+Via\s+(\w+)\s+Ref\s+([A-Z0-9]+)\s+by\s+(.+?)\s+Phone\s+(\d+)\s+on\s+(\d{2}-\d{2}-\d{4})\s+at\s+(\d{2}:\d{2})""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // Very flexible pattern for edge cases
    private val EQUITY_SMS_PATTERN_FLEXIBLE = Pattern.compile(
        """Confirmed\s*([A-Z]{3})[\.\s]*([\d,\.]+)\s*to\s*([A-Za-z\s]+?)\s*A/?C\s*Ref\.?\s*Number\s*(\d+).*?Via\s*(\w+)\s*Ref\s*([A-Z0-9]+).*?by\s*(.+?)\s*Phone\s*(\d+).*?on\s*(\d{2}-\d{2}-\d{4})\s*at\s*(\d{2}:\d{2})""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    // Minimal pattern to catch malformed messages
    private val EQUITY_SMS_PATTERN_MINIMAL = Pattern.compile(
        """Confirmed.*?([A-Z]{3})[\.\s]*([\d,\.]+).*?to\s+(.+?)\s+A/?C.*?Ref.*?Number\s*(\d+).*?Via\s+(\w+)\s+Ref\s+([A-Z0-9]+).*?by\s+(.+?)\s+Phone\s+(\d+).*?(\d{2}-\d{2}-\d{4}).*?(\d{2}:\d{2})""",
        Pattern.CASE_INSENSITIVE or Pattern.DOTALL
    )

    /**
     * Checks if the SMS message matches Equity Bank patterns.
     * Uses template matching instead of sender validation.
     */
    private fun matchesEquityPattern(smsBody: String): Boolean {
        val normalizedBody = smsBody.replace(Regex("\\s+"), " ").trim()
        for (pattern in EQUITY_PATTERNS) {
            if (!normalizedBody.contains(pattern, ignoreCase = true)) {
                Log.w(TAG, ">>> Pattern not found: '$pattern'")
                return false
            }
        }
        Log.w(TAG, ">>> ✓ All Equity patterns found!")
        return true
    }

    /**
     * Parses an Equity Bank SMS message and extracts transaction details.
     * 
     * @param smsBody The SMS message body
     * @param smsSender The SMS sender address
     * @return TransactionData if parsing succeeds, null otherwise
     */
    fun parseEquityBankSms(smsBody: String, smsSender: String): TransactionData? {
        Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.w(TAG, "▓▓▓  SMS PARSER CALLED                     ▓▓▓")
        Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.w(TAG, ">>> Sender: $smsSender")
        Log.w(TAG, ">>> Length: ${smsBody.length} chars")
        Log.w(TAG, ">>> Body: $smsBody")

        // Normalize the SMS body - remove extra whitespace and newlines
        val normalizedBody = smsBody
            .replace("\n", " ")
            .replace("\r", " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        
        Log.w(TAG, ">>> Normalized: $normalizedBody")

        // Quick check: does it match Equity Bank pattern?
        if (!matchesEquityPattern(smsBody)) {
            Log.e(TAG, ">>> ✗ Message does not match Equity Bank pattern signature")
            return null
        }

        Log.w(TAG, ">>> ✓ Pattern signature verified, proceeding with regex parsing")

        // Try patterns in order of strictness
        val patterns = listOf(
            "PRIMARY" to EQUITY_SMS_PATTERN,
            "FLEXIBLE" to EQUITY_SMS_PATTERN_FLEXIBLE,
            "MINIMAL" to EQUITY_SMS_PATTERN_MINIMAL
        )

        for ((patternName, pattern) in patterns) {
            Log.w(TAG, ">>> Trying $patternName pattern...")
            val matcher = pattern.matcher(normalizedBody)
            
            if (matcher.find()) {
                Log.w(TAG, ">>> ✓ $patternName pattern MATCHED!")
                return try {
                    extractTransactionData(matcher, smsBody, smsSender, patternName)
                } catch (e: Exception) {
                    Log.e(TAG, ">>> ✗ Error extracting with $patternName: ${e.message}")
                    e.printStackTrace()
                    null
                }
            } else {
                Log.w(TAG, ">>> ✗ $patternName pattern did not match")
            }
        }

        Log.e(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.e(TAG, "▓▓▓  ALL PATTERNS FAILED!                  ▓▓▓")
        Log.e(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.e(TAG, ">>> Received: $normalizedBody")
        
        return null
    }

    private fun extractTransactionData(
        matcher: java.util.regex.Matcher,
        originalBody: String,
        smsSender: String,
        patternName: String
    ): TransactionData {
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

        Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.w(TAG, "▓▓▓  TRANSACTION PARSED! ($patternName)    ▓▓▓")
        Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        Log.w(TAG, ">>> Currency:       $currency")
        Log.w(TAG, ">>> Amount:         $amount")
        Log.w(TAG, ">>> Recipient:      $recipientName")
        Log.w(TAG, ">>> Account Ref:    $accountReference")
        Log.w(TAG, ">>> Payment Method: $paymentMethod")
        Log.w(TAG, ">>> MPESA Ref:      $mpesaReference")
        Log.w(TAG, ">>> Sender Name:    $senderName")
        Log.w(TAG, ">>> Sender Phone:   $senderPhone")
        Log.w(TAG, ">>> Date:           $transactionDate")
        Log.w(TAG, ">>> Time:           $transactionTime")

        val transactionId = generateTransactionId(mpesaReference, accountReference)
        Log.w(TAG, ">>> Generated ID: $transactionId")

        return TransactionData(
            id = transactionId,
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
            rawMessage = originalBody,
            smsSender = smsSender,
            status = "confirmed",
            createdAt = System.currentTimeMillis()
        )
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
        val normalizedBody = smsBody.replace(Regex("\\s+"), " ").trim()
        return EQUITY_SMS_PATTERN.matcher(normalizedBody).find() ||
               EQUITY_SMS_PATTERN_FLEXIBLE.matcher(normalizedBody).find() ||
               EQUITY_SMS_PATTERN_MINIMAL.matcher(normalizedBody).find()
    }

    /**
     * Extracts just the amount from the SMS for quick validation.
     */
    fun extractAmount(smsBody: String): Double? {
        val normalizedBody = smsBody.replace(Regex("\\s+"), " ").trim()
        val matcher = EQUITY_SMS_PATTERN.matcher(normalizedBody)
        if (matcher.find()) {
            val amountStr = matcher.group(2)?.replace(",", "")?.trim()
            return amountStr?.toDoubleOrNull()
        }
        return null
    }
}
