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

    private var firestore: FirebaseFirestore? = null
    private var firebaseInitialized = false

    init {
        initializeFirebase()
    }

    private fun initializeFirebase() {
        try {
            Log.d(TAG, "====== INITIALIZING FIREBASE ======")
            Log.d(TAG, "Existing Firebase apps: ${FirebaseApp.getApps(context).size}")
            
            if (FirebaseApp.getApps(context).isEmpty()) {
                Log.d(TAG, "No Firebase apps found, attempting to initialize...")
                FirebaseApp.initializeApp(context)
                Log.d(TAG, "FirebaseApp.initializeApp() completed")
            } else {
                Log.d(TAG, "Firebase already initialized")
            }
            
            firestore = FirebaseFirestore.getInstance()
            firebaseInitialized = true
            Log.d(TAG, "✓ Firebase Firestore initialized successfully")
            Log.d(TAG, "====================================")
        } catch (e: Exception) {
            Log.e(TAG, "====== FIREBASE INIT FAILED ======")
            Log.e(TAG, "Error: ${e.message}")
            Log.e(TAG, "This usually means google-services.json is missing!")
            Log.e(TAG, "Transactions will be saved locally only.")
            e.printStackTrace()
            Log.e(TAG, "===================================")
            firebaseInitialized = false
        }
    }

    /**
     * Checks if Firestore is available.
     */
    fun isAvailable(): Boolean {
        return firebaseInitialized && firestore != null
    }

    /**
     * Saves a new transaction to Firestore.
     * Uses the transaction ID as the document ID for deduplication.
     */
    suspend fun saveTransaction(transaction: TransactionData): Result<String> {
        if (!isAvailable()) {
            Log.w(TAG, "Firestore not available - transaction saved locally only")
            return Result.failure(Exception("Firestore not configured - missing google-services.json"))
        }
        
        return try {
            Log.d(TAG, "Saving transaction to Firestore: ${transaction.id}")
            
            firestore!!.collection(COLLECTION_TRANSACTIONS)
                .document(transaction.id)
                .set(transaction.toMap(), SetOptions.merge())
                .await()
            
            Log.d(TAG, "✓ Transaction saved to Firestore: ${transaction.id}")
            Result.success(transaction.id)
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to save transaction: ${e.message}")
            e.printStackTrace()
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
        Log.d(TAG, "saveTransactionAsync called for: ${transaction.id}")
        
        if (!isAvailable()) {
            val error = "Firestore not configured - missing google-services.json. Transaction saved locally only."
            Log.w(TAG, error)
            onError(error)
            return
        }
        
        Log.d(TAG, "Attempting to save to Firestore collection: $COLLECTION_TRANSACTIONS")
        
        firestore!!.collection(COLLECTION_TRANSACTIONS)
            .document(transaction.id)
            .set(transaction.toMap(), SetOptions.merge())
            .addOnSuccessListener {
                Log.d(TAG, "✓ Transaction saved to Firestore: ${transaction.id}")
                onSuccess(transaction.id)
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "✗ Failed to save transaction to Firestore: ${e.message}")
                e.printStackTrace()
                onError(e.message ?: "Unknown Firestore error")
            }
    }

    /**
     * Retrieves a transaction by ID.
     */
    suspend fun getTransaction(transactionId: String): Result<TransactionData?> {
        if (!isAvailable()) {
            return Result.failure(Exception("Firestore not configured"))
        }
        
        return try {
            val document = firestore!!.collection(COLLECTION_TRANSACTIONS)
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
        if (!isAvailable()) {
            return Result.failure(Exception("Firestore not configured"))
        }
        
        return try {
            firestore!!.collection(COLLECTION_TRANSACTIONS)
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
        if (!isAvailable()) {
            Log.w(TAG, "Firestore not available - returning empty list")
            return Result.success(emptyList())
        }
        
        return try {
            val querySnapshot = firestore!!.collection(COLLECTION_TRANSACTIONS)
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
        if (!isAvailable()) {
            return Result.success(emptyList())
        }
        
        return try {
            val querySnapshot = firestore!!.collection(COLLECTION_TRANSACTIONS)
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
        if (!isAvailable()) {
            return false
        }
        
        return try {
            val querySnapshot = firestore!!.collection(COLLECTION_TRANSACTIONS)
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
