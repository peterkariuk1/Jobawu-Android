package expo.modules.equitysms

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Local storage for transactions using SharedPreferences.
 * Provides offline caching before Firestore sync.
 * 
 * Storage structure:
 * - pending_transactions: Transactions not yet synced to Firestore
 * - synced_transactions: Transactions successfully synced to Firestore
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
        val pendingCount = getPendingTransactions().size
        val syncedCount = getSyncedTransactions().size
        Log.d(TAG, "Storage status: $pendingCount pending, $syncedCount synced")
    }

    /**
     * Saves a transaction locally (pending sync to Firestore).
     * Returns false if transaction already exists (duplicate detection).
     */
    fun savePendingTransaction(transaction: TransactionData): Boolean {
        Log.w(TAG, "▓▓▓ savePendingTransaction called ▓▓▓")
        Log.w(TAG, ">>> ID: ${transaction.id}")
        Log.w(TAG, ">>> MPESA Ref: ${transaction.mpesaReference}")
        
        return try {
            val pending = getPendingTransactionsInternal().toMutableList()
            val synced = getSyncedTransactionsInternal()
            
            Log.w(TAG, ">>> Current pending: ${pending.size}, synced: ${synced.size}")
            
            // Check for duplicates by mpesaReference in both pending and synced
            if (pending.any { it.mpesaReference == transaction.mpesaReference }) {
                Log.w(TAG, ">>> ✗ Duplicate in pending (mpesaRef: ${transaction.mpesaReference})")
                return false
            }
            if (synced.any { it.mpesaReference == transaction.mpesaReference }) {
                Log.w(TAG, ">>> ✗ Duplicate in synced (mpesaRef: ${transaction.mpesaReference})")
                return false
            }
            
            pending.add(transaction)
            savePendingTransactionsInternal(pending)
            
            Log.w(TAG, ">>> ✓ Saved locally! Total pending: ${pending.size}")
            true
        } catch (e: Exception) {
            Log.e(TAG, ">>> ✗ Failed: ${e.message}")
            e.printStackTrace()
            false
        }
    }

    /**
     * Gets all pending transactions (not yet synced to Firestore).
     */
    fun getPendingTransactions(): List<TransactionData> {
        val pending = getPendingTransactionsInternal()
        Log.d(TAG, "getPendingTransactions: ${pending.size} transactions")
        return pending
    }

    /**
     * Marks a transaction as synced (moves from pending to synced).
     */
    fun markAsSynced(transactionId: String): Boolean {
        Log.d(TAG, "markAsSynced: $transactionId")
        
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
                
                Log.i(TAG, "✓ Transaction marked as synced: $transactionId")
                Log.d(TAG, "Pending: ${pending.size}, Synced: ${synced.size}")
                true
            } else {
                Log.w(TAG, "Transaction not found in pending: $transactionId")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to mark as synced: ${e.message}")
            e.printStackTrace()
            false
        }
    }

    /**
     * Marks a transaction as reconciled locally.
     * Updates the transaction in either pending or synced list.
     */
    fun markAsReconciled(transactionId: String): Boolean {
        Log.d(TAG, "markAsReconciled (local): $transactionId")
        
        return try {
            val reconciledAt = System.currentTimeMillis()
            
            // Check in synced transactions first
            val synced = getSyncedTransactionsInternal().toMutableList()
            val syncedIndex = synced.indexOfFirst { it.id == transactionId }
            
            if (syncedIndex >= 0) {
                val updated = synced[syncedIndex].copy(
                    reconciled = true,
                    reconciledAt = reconciledAt
                )
                synced[syncedIndex] = updated
                saveSyncedTransactionsInternal(synced)
                Log.i(TAG, "✓ Transaction marked as reconciled (synced): $transactionId")
                return true
            }
            
            // Check in pending transactions
            val pending = getPendingTransactionsInternal().toMutableList()
            val pendingIndex = pending.indexOfFirst { it.id == transactionId }
            
            if (pendingIndex >= 0) {
                val updated = pending[pendingIndex].copy(
                    reconciled = true,
                    reconciledAt = reconciledAt
                )
                pending[pendingIndex] = updated
                savePendingTransactionsInternal(pending)
                Log.i(TAG, "✓ Transaction marked as reconciled (pending): $transactionId")
                return true
            }
            
            Log.w(TAG, "Transaction not found: $transactionId")
            false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to mark as reconciled: ${e.message}")
            e.printStackTrace()
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
        val all = (getPendingTransactionsInternal() + getSyncedTransactionsInternal())
            .sortedByDescending { it.createdAt }
        Log.d(TAG, "getAllTransactions: ${all.size} total")
        return all
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
            Log.d(TAG, "Pruned transactions, keeping $keepCount")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to prune transactions: ${e.message}")
        }
    }

    /**
     * Clears all local data (for testing/reset).
     */
    fun clearAll() {
        Log.w(TAG, "Clearing all local transactions")
        prefs.edit()
            .putString(KEY_PENDING_TRANSACTIONS, "[]")
            .putString(KEY_SYNCED_TRANSACTIONS, "[]")
            .apply()
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
