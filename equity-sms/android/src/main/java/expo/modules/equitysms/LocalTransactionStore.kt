package expo.modules.equitysms

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Local storage for transactions using SharedPreferences.
 * Provides offline caching before Firestore sync.
 */
class LocalTransactionStore(context: Context) {

    companion object {
        private const val TAG = "LocalTransactionStore"
        private const val PREFS_NAME = "equity_sms_transactions"
        private const val KEY_PENDING_TRANSACTIONS = "pending_transactions"
        private const val KEY_SYNCED_TRANSACTIONS = "synced_transactions"
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        Log.d(TAG, "LocalTransactionStore initialized")
        Log.d(TAG, "Pending transactions: ${getPendingTransactions().size}")
        Log.d(TAG, "Synced transactions: ${getSyncedTransactions().size}")
    }

    /**
     * Saves a transaction locally (pending sync to Firestore).
     */
    fun savePendingTransaction(transaction: TransactionData): Boolean {
        Log.d(TAG, "savePendingTransaction called for: ${transaction.id}")
        
        return try {
            val pending = getPendingTransactionsInternal().toMutableList()
            Log.d(TAG, "Current pending count: ${pending.size}")
            
            // Check for duplicates by mpesaReference
            if (pending.any { it.mpesaReference == transaction.mpesaReference }) {
                Log.d(TAG, "Transaction already exists locally (duplicate mpesaRef): ${transaction.mpesaReference}")
                return false
            }
            
            pending.add(transaction)
            savePendingTransactionsInternal(pending)
            Log.d(TAG, "✓ Transaction saved locally: ${transaction.id}")
            Log.d(TAG, "New pending count: ${pending.size}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to save transaction locally: ${e.message}")
            e.printStackTrace()
            false
        }
    }

    /**
     * Gets all pending transactions (not yet synced to Firestore).
     */
    fun getPendingTransactions(): List<TransactionData> {
        val pending = getPendingTransactionsInternal()
        Log.d(TAG, "getPendingTransactions: returning ${pending.size} transactions")
        return pending
    }

    /**
     * Marks a transaction as synced (moves from pending to synced).
     */
    fun markAsSynced(transactionId: String): Boolean {
        return try {
            val pending = getPendingTransactionsInternal().toMutableList()
            val transaction = pending.find { it.id == transactionId }
            
            if (transaction != null) {
                pending.removeIf { it.id == transactionId }
                savePendingTransactionsInternal(pending)
                
                // Add to synced list
                val synced = getSyncedTransactionsInternal().toMutableList()
                synced.add(transaction)
                saveSyncedTransactionsInternal(synced)
                
                Log.d(TAG, "Transaction marked as synced: $transactionId")
                true
            } else {
                Log.w(TAG, "Transaction not found in pending: $transactionId")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to mark transaction as synced: ${e.message}")
            false
        }
    }

    /**
     * Gets all synced transactions (for display in recent transactions).
     */
    fun getSyncedTransactions(): List<TransactionData> {
        return getSyncedTransactionsInternal()
    }

    /**
     * Gets all transactions (pending + synced) for display.
     */
    fun getAllTransactions(): List<TransactionData> {
        return (getPendingTransactionsInternal() + getSyncedTransactionsInternal())
            .sortedByDescending { it.createdAt }
    }

    /**
     * Clears old synced transactions (keeps last 100).
     */
    fun pruneOldTransactions(keepCount: Int = 100) {
        try {
            val synced = getSyncedTransactionsInternal()
                .sortedByDescending { it.createdAt }
                .take(keepCount)
            saveSyncedTransactionsInternal(synced)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to prune transactions: ${e.message}")
        }
    }

    private fun getPendingTransactionsInternal(): List<TransactionData> {
        return try {
            val json = prefs.getString(KEY_PENDING_TRANSACTIONS, "[]") ?: "[]"
            parseTransactionList(json)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get pending transactions: ${e.message}")
            emptyList()
        }
    }

    private fun getSyncedTransactionsInternal(): List<TransactionData> {
        return try {
            val json = prefs.getString(KEY_SYNCED_TRANSACTIONS, "[]") ?: "[]"
            parseTransactionList(json)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get synced transactions: ${e.message}")
            emptyList()
        }
    }

    private fun savePendingTransactionsInternal(transactions: List<TransactionData>) {
        val json = serializeTransactionList(transactions)
        prefs.edit().putString(KEY_PENDING_TRANSACTIONS, json).apply()
    }

    private fun saveSyncedTransactionsInternal(transactions: List<TransactionData>) {
        val json = serializeTransactionList(transactions)
        prefs.edit().putString(KEY_SYNCED_TRANSACTIONS, json).apply()
    }

    private fun parseTransactionList(json: String): List<TransactionData> {
        val result = mutableListOf<TransactionData>()
        val array = JSONArray(json)
        
        for (i in 0 until array.length()) {
            val obj = array.getJSONObject(i)
            result.add(TransactionData(
                id = obj.optString("id", ""),
                amount = obj.optDouble("amount", 0.0),
                currency = obj.optString("currency", "KES"),
                recipientName = obj.optString("recipientName", ""),
                accountReference = obj.optString("accountReference", ""),
                mpesaReference = obj.optString("mpesaReference", ""),
                paymentMethod = obj.optString("paymentMethod", ""),
                senderName = obj.optString("senderName", ""),
                senderPhone = obj.optString("senderPhone", ""),
                transactionDate = obj.optString("transactionDate", ""),
                transactionTime = obj.optString("transactionTime", ""),
                rawMessage = obj.optString("rawMessage", ""),
                smsSender = obj.optString("smsSender", ""),
                status = obj.optString("status", "pending"),
                createdAt = obj.optLong("createdAt", System.currentTimeMillis()),
                reconciled = obj.optBoolean("reconciled", false),
                reconciledAt = if (obj.has("reconciledAt") && !obj.isNull("reconciledAt")) 
                    obj.optLong("reconciledAt") else null
            ))
        }
        
        return result
    }

    private fun serializeTransactionList(transactions: List<TransactionData>): String {
        val array = JSONArray()
        
        for (transaction in transactions) {
            val obj = JSONObject().apply {
                put("id", transaction.id)
                put("amount", transaction.amount)
                put("currency", transaction.currency)
                put("recipientName", transaction.recipientName)
                put("accountReference", transaction.accountReference)
                put("mpesaReference", transaction.mpesaReference)
                put("paymentMethod", transaction.paymentMethod)
                put("senderName", transaction.senderName)
                put("senderPhone", transaction.senderPhone)
                put("transactionDate", transaction.transactionDate)
                put("transactionTime", transaction.transactionTime)
                put("rawMessage", transaction.rawMessage)
                put("smsSender", transaction.smsSender)
                put("status", transaction.status)
                put("createdAt", transaction.createdAt)
                put("reconciled", transaction.reconciled)
                put("reconciledAt", transaction.reconciledAt)
            }
            array.put(obj)
        }
        
        return array.toString()
    }
}
