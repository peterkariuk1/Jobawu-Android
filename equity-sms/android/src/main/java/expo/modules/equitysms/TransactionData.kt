package expo.modules.equitysms

import java.io.Serializable

/**
 * Data class representing a parsed Equity Bank transaction.
 * This structure will be stored in Firestore.
 */
data class TransactionData(
    val id: String,                      // Unique transaction ID (generated)
    val amount: Double,                  // Transaction amount in KES
    val currency: String,                // Currency code (KES)
    val recipientName: String,           // Recipient name (e.g., "GRACEWANGECHIMUREITHI")
    val accountReference: String,        // A/C Ref.Number (e.g., "11111")
    val mpesaReference: String,          // MPESA Ref (e.g., "UAGH013ERL6")
    val paymentMethod: String,           // Payment method (e.g., "MPESA")
    val senderName: String,              // Sender name (e.g., "Dennis Ngumbi Agnes")
    val senderPhone: String,             // Sender phone (e.g., "25479354525")
    val transactionDate: String,         // Date (e.g., "10-01-2026")
    val transactionTime: String,         // Time (e.g., "10:39")
    val rawMessage: String,              // Original SMS message
    val smsSender: String,               // SMS sender address
    val status: String,                  // Transaction status (e.g., "confirmed", "pending")
    val createdAt: Long,                 // Timestamp when record was created
    val reconciled: Boolean = false,     // Whether transaction has been reconciled
    val reconciledAt: Long? = null       // Timestamp when reconciled
) : Serializable {

    /**
     * Converts the transaction data to a Map for Firestore storage.
     */
    fun toMap(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "amount" to amount,
            "currency" to currency,
            "recipientName" to recipientName,
            "accountReference" to accountReference,
            "mpesaReference" to mpesaReference,
            "paymentMethod" to paymentMethod,
            "senderName" to senderName,
            "senderPhone" to senderPhone,
            "transactionDate" to transactionDate,
            "transactionTime" to transactionTime,
            "rawMessage" to rawMessage,
            "smsSender" to smsSender,
            "status" to status,
            "createdAt" to createdAt,
            "reconciled" to reconciled,
            "reconciledAt" to reconciledAt
        )
    }

    companion object {
        /**
         * Creates a TransactionData object from a Firestore document map.
         */
        fun fromMap(map: Map<String, Any?>): TransactionData {
            return TransactionData(
                id = map["id"] as? String ?: "",
                amount = (map["amount"] as? Number)?.toDouble() ?: 0.0,
                currency = map["currency"] as? String ?: "KES",
                recipientName = map["recipientName"] as? String ?: "",
                accountReference = map["accountReference"] as? String ?: "",
                mpesaReference = map["mpesaReference"] as? String ?: "",
                paymentMethod = map["paymentMethod"] as? String ?: "",
                senderName = map["senderName"] as? String ?: "",
                senderPhone = map["senderPhone"] as? String ?: "",
                transactionDate = map["transactionDate"] as? String ?: "",
                transactionTime = map["transactionTime"] as? String ?: "",
                rawMessage = map["rawMessage"] as? String ?: "",
                smsSender = map["smsSender"] as? String ?: "",
                status = map["status"] as? String ?: "pending",
                createdAt = (map["createdAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                reconciled = map["reconciled"] as? Boolean ?: false,
                reconciledAt = (map["reconciledAt"] as? Number)?.toLong()
            )
        }
    }
}
