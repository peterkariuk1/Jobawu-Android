package expo.modules.equitysms

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.delay

/**
 * Repository for Firestore operations related to transaction reconciliation.
 * Features:
 * - Offline persistence for reliable data sync
 * - Retry logic for failed operations
 * - Comprehensive logging for debugging
 */
class FirestoreRepository(private val context: Context) {

    companion object {
        private const val TAG = "FirestoreRepository"
        private const val COLLECTION_TRANSACTIONS = "transactions"
        private const val COLLECTION_RECONCILIATION = "reconciliation"
        private const val MAX_RETRIES = 3
        private const val RETRY_DELAY_MS = 1000L
    }

    private var firestore: FirebaseFirestore? = null
    private var firebaseInitialized = false

    init {
        initializeFirebase()
    }

    private fun initializeFirebase() {
        try {
            Log.d(TAG, "====== INITIALIZING FIREBASE ======")
            Log.d(TAG, "Context package: ${context.packageName}")
            Log.d(TAG, "Existing Firebase apps: ${FirebaseApp.getApps(context).size}")
            
            if (FirebaseApp.getApps(context).isEmpty()) {
                Log.d(TAG, "No Firebase apps found, attempting to initialize...")
                FirebaseApp.initializeApp(context)
                Log.d(TAG, "FirebaseApp.initializeApp() completed")
            } else {
                Log.d(TAG, "Firebase already initialized, app name: ${FirebaseApp.getInstance().name}")
            }
            
            firestore = FirebaseFirestore.getInstance()
            
            // Enable offline persistence for reliable background operation
            val settings = FirebaseFirestoreSettings.Builder()
                .setPersistenceEnabled(true)
                .setCacheSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED)
                .build()
            firestore?.firestoreSettings = settings
            Log.d(TAG, "✓ Firestore offline persistence enabled")
            
            firebaseInitialized = true
            Log.i(TAG, "====== FIREBASE INITIALIZED SUCCESSFULLY ======")
            Log.i(TAG, "Project ID: ${FirebaseApp.getInstance().options.projectId}")
            Log.i(TAG, "=================================================")
        } catch (e: Exception) {
            Log.e(TAG, "====== FIREBASE INIT FAILED ======")
            Log.e(TAG, "Error: ${e.message}")
            Log.e(TAG, "Exception type: ${e.javaClass.simpleName}")
            Log.e(TAG, "This usually means google-services.json is missing or invalid!")
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
        val available = firebaseInitialized && firestore != null
        Log.d(TAG, "isAvailable() = $available")
        return available
    }

    /**
     * Saves a new transaction to Firestore.
     * Uses the transaction ID as the document ID for deduplication.
     * Includes retry logic for transient failures.
     */
    suspend fun saveTransaction(transaction: TransactionData): Result<String> {
        if (!isAvailable()) {
            Log.w(TAG, "Firestore not available - transaction saved locally only: ${transaction.id}")
            return Result.failure(Exception("Firestore not configured - missing google-services.json"))
        }
        
        var lastException: Exception? = null
        
        for (attempt in 1..MAX_RETRIES) {
            try {
                Log.d(TAG, "Saving transaction to Firestore (attempt $attempt/$MAX_RETRIES): ${transaction.id}")
                
                firestore!!.collection(COLLECTION_TRANSACTIONS)
                    .document(transaction.id)
                    .set(transaction.toMap(), SetOptions.merge())
                    .await()
                
                Log.i(TAG, "====== FIRESTORE SAVE SUCCESS ======")
                Log.i(TAG, "Transaction ID: ${transaction.id}")
                Log.i(TAG, "Amount: ${transaction.amount} ${transaction.currency}")
                Log.i(TAG, "MPESA Ref: ${transaction.mpesaReference}")
                Log.i(TAG, "Attempt: $attempt/$MAX_RETRIES")
                Log.i(TAG, "====================================")
                
                return Result.success(transaction.id)
            } catch (e: Exception) {
                lastException = e
                Log.w(TAG, "Firestore save attempt $attempt failed: ${e.message}")
                if (attempt < MAX_RETRIES) {
                    val delayMs = RETRY_DELAY_MS * attempt
                    Log.d(TAG, "Retrying in ${delayMs}ms...")
                    delay(delayMs)
                }
            }
        }
        
        Log.e(TAG, "====== FIRESTORE SAVE FAILED ======")
        Log.e(TAG, "Transaction ID: ${transaction.id}")
        Log.e(TAG, "Error after $MAX_RETRIES attempts: ${lastException?.message}")
        Log.e(TAG, "Transaction will remain in local pending queue")
        Log.e(TAG, "===================================")
        
        return Result.failure(lastException ?: Exception("Failed to save after $MAX_RETRIES attempts"))
    }

    /**
     * Saves transaction with callback (for non-coroutine usage).
     * Includes retry logic for reliability.
     */
    fun saveTransactionAsync(
        transaction: TransactionData,
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        Log.d(TAG, "====== ASYNC SAVE INITIATED ======")
        Log.d(TAG, "Transaction ID: ${transaction.id}")
        Log.d(TAG, "Amount: ${transaction.amount} ${transaction.currency}")
        Log.d(TAG, "MPESA Ref: ${transaction.mpesaReference}")
        
        if (!isAvailable()) {
            val error = "Firestore not configured - missing google-services.json. Transaction saved locally only."
            Log.w(TAG, error)
            onError(error)
            return
        }
        
        Log.d(TAG, "Saving to collection: $COLLECTION_TRANSACTIONS")
        Log.d(TAG, "Document ID: ${transaction.id}")
        
        firestore!!.collection(COLLECTION_TRANSACTIONS)
            .document(transaction.id)
            .set(transaction.toMap(), SetOptions.merge())
            .addOnSuccessListener {
                Log.i(TAG, "====== ASYNC SAVE SUCCESS ======")
                Log.i(TAG, "Transaction saved: ${transaction.id}")
                Log.i(TAG, "Amount: ${transaction.amount} ${transaction.currency}")
                Log.i(TAG, "=================================")
                onSuccess(transaction.id)
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "====== ASYNC SAVE FAILED ======")
                Log.e(TAG, "Transaction: ${transaction.id}")
                Log.e(TAG, "Error: ${e.message}")
                Log.e(TAG, "Exception type: ${e.javaClass.simpleName}")
                e.printStackTrace()
                Log.e(TAG, "================================")
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
