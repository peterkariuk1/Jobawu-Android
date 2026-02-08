package expo.modules.equitysms

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await

/**
 * Repository for Firestore operations related to transaction reconciliation.
 */
class FirestoreRepository(private val context: Context) {

    companion object {
        private const val TAG = "FirestoreRepository"
        private const val COLLECTION_TRANSACTIONS = "transactions"
        private const val COLLECTION_RECONCILIATION = "reconciliation"
    }

    private val firestore: FirebaseFirestore by lazy {
        // Ensure Firebase is initialized
        if (FirebaseApp.getApps(context).isEmpty()) {
            FirebaseApp.initializeApp(context)
        }
        FirebaseFirestore.getInstance()
    }

    /**
     * Saves a new transaction to Firestore.
     * Uses the transaction ID as the document ID for deduplication.
     */
    suspend fun saveTransaction(transaction: TransactionData): Result<String> {
        return try {
            Log.d(TAG, "Saving transaction: ${transaction.id}")
            
            firestore.collection(COLLECTION_TRANSACTIONS)
                .document(transaction.id)
                .set(transaction.toMap(), SetOptions.merge())
                .await()
            
            Log.d(TAG, "Transaction saved successfully: ${transaction.id}")
            Result.success(transaction.id)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save transaction: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * Saves transaction with callback (for non-coroutine usage).
     */
    fun saveTransactionAsync(
        transaction: TransactionData,
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        Log.d(TAG, "Saving transaction async: ${transaction.id}")
        
        firestore.collection(COLLECTION_TRANSACTIONS)
            .document(transaction.id)
            .set(transaction.toMap(), SetOptions.merge())
            .addOnSuccessListener {
                Log.d(TAG, "Transaction saved successfully: ${transaction.id}")
                onSuccess(transaction.id)
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to save transaction: ${e.message}")
                onError(e.message ?: "Unknown error")
            }
    }

    /**
     * Retrieves a transaction by ID.
     */
    suspend fun getTransaction(transactionId: String): Result<TransactionData?> {
        return try {
            val document = firestore.collection(COLLECTION_TRANSACTIONS)
                .document(transactionId)
                .get()
                .await()
            
            if (document.exists()) {
                val data = document.data
                if (data != null) {
                    Result.success(TransactionData.fromMap(data))
                } else {
                    Result.success(null)
                }
            } else {
                Result.success(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get transaction: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * Marks a transaction as reconciled.
     */
    suspend fun markAsReconciled(transactionId: String): Result<Boolean> {
        return try {
            firestore.collection(COLLECTION_TRANSACTIONS)
                .document(transactionId)
                .update(
                    mapOf(
                        "reconciled" to true,
                        "reconciledAt" to System.currentTimeMillis()
                    )
                )
                .await()
            
            Log.d(TAG, "Transaction marked as reconciled: $transactionId")
            Result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to mark transaction as reconciled: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * Gets all unreconciled transactions.
     */
    suspend fun getUnreconciledTransactions(): Result<List<TransactionData>> {
        return try {
            val querySnapshot = firestore.collection(COLLECTION_TRANSACTIONS)
                .whereEqualTo("reconciled", false)
                .get()
                .await()
            
            val transactions = querySnapshot.documents.mapNotNull { doc ->
                doc.data?.let { TransactionData.fromMap(it) }
            }
            
            Result.success(transactions)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get unreconciled transactions: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * Gets transactions by date range.
     */
    suspend fun getTransactionsByDateRange(
        startDate: String,
        endDate: String
    ): Result<List<TransactionData>> {
        return try {
            val querySnapshot = firestore.collection(COLLECTION_TRANSACTIONS)
                .whereGreaterThanOrEqualTo("transactionDate", startDate)
                .whereLessThanOrEqualTo("transactionDate", endDate)
                .get()
                .await()
            
            val transactions = querySnapshot.documents.mapNotNull { doc ->
                doc.data?.let { TransactionData.fromMap(it) }
            }
            
            Result.success(transactions)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get transactions by date range: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * Checks if a transaction already exists (for deduplication).
     */
    suspend fun transactionExists(mpesaReference: String): Boolean {
        return try {
            val querySnapshot = firestore.collection(COLLECTION_TRANSACTIONS)
                .whereEqualTo("mpesaReference", mpesaReference)
                .limit(1)
                .get()
                .await()
            
            !querySnapshot.isEmpty
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check transaction existence: ${e.message}")
            false
        }
    }
}
