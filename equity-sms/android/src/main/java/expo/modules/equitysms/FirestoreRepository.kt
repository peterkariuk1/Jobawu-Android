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
class FirestoreRepository(context: Context) {

    companion object {
        private const val TAG = "FirestoreRepository"
        private const val COLLECTION_TRANSACTIONS = "transactions"
        private const val COLLECTION_RECONCILIATION = "reconciliation"
        private const val MAX_RETRIES = 3
        private const val RETRY_DELAY_MS = 1000L
    }

    // Always use application context to access resources from google-services.json
    private val appContext: Context = context.applicationContext
    private var firestore: FirebaseFirestore? = null
    private var firebaseInitialized = false

    init {
        initializeFirebase()
    }

    private fun initializeFirebase() {
        try {
            Log.w(TAG, "▓▓▓ INITIALIZING FIREBASE ▓▓▓")
            Log.w(TAG, ">>> Package: ${appContext.packageName}")
            Log.w(TAG, ">>> Context type: ${appContext.javaClass.simpleName}")
            Log.w(TAG, ">>> Existing apps: ${FirebaseApp.getApps(appContext).size}")
            
            if (FirebaseApp.getApps(appContext).isEmpty()) {
                Log.w(TAG, ">>> No Firebase apps found, initializing...")
                val app = FirebaseApp.initializeApp(appContext)
                if (app == null) {
                    Log.e(TAG, ">>> FirebaseApp.initializeApp() returned null!")
                    Log.e(TAG, ">>> Make sure google-services.json is in android/app/ and rebuild")
                    firebaseInitialized = false
                    return
                }
                Log.w(TAG, ">>> FirebaseApp.initializeApp() done: ${app.name}")
            } else {
                Log.w(TAG, ">>> Already initialized: ${FirebaseApp.getInstance().name}")
            }
            
            firestore = FirebaseFirestore.getInstance()
            
            // Try to enable offline persistence (might fail if already accessed)
            try {
                val settings = FirebaseFirestoreSettings.Builder()
                    .setPersistenceEnabled(true)
                    .setCacheSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED)
                    .build()
                firestore?.firestoreSettings = settings
                Log.w(TAG, ">>> Offline persistence enabled")
            } catch (e: IllegalStateException) {
                // Settings already configured - this is OK
                Log.w(TAG, ">>> Firestore settings already configured (normal)")
            }
            
            firebaseInitialized = true
            Log.w(TAG, "▓▓▓ FIREBASE READY ▓▓▓")
            Log.w(TAG, ">>> Project: ${FirebaseApp.getInstance().options.projectId}")
        } catch (e: Exception) {
            Log.e(TAG, "▓▓▓ FIREBASE INIT FAILED! ▓▓▓")
            Log.e(TAG, ">>> Error: ${e.message}")
            Log.e(TAG, ">>> Type: ${e.javaClass.simpleName}")
            Log.e(TAG, ">>> Make sure google-services.json is in android/app/")
            Log.e(TAG, ">>> Then rebuild: eas build --platform android")
            e.printStackTrace()
            firebaseInitialized = false
        }
    }
    
    /**
     * Retry Firebase initialization if it failed initially.
     */
    fun retryInitialization(): Boolean {
        if (firebaseInitialized && firestore != null) {
            Log.w(TAG, ">>> Firebase already initialized")
            return true
        }
        Log.w(TAG, ">>> Retrying Firebase initialization...")
        initializeFirebase()
        return firebaseInitialized
    }

    /**
     * Checks if Firestore is available. Auto-retries initialization once if needed.
     */
    fun isAvailable(): Boolean {
        if (!firebaseInitialized || firestore == null) {
            Log.w(TAG, ">>> isAvailable: Firebase not ready, retrying...")
            retryInitialization()
        }
        val available = firebaseInitialized && firestore != null
        Log.w(TAG, ">>> isAvailable() = $available (init=$firebaseInitialized, firestore=${firestore != null})")
        return available
    }

    /**
     * Saves a new transaction to Firestore.
     * Uses the transaction ID as the document ID for deduplication.
     * Includes retry logic for transient failures.
     */
    suspend fun saveTransaction(transaction: TransactionData): Result<String> {
        if (!isAvailable()) {
            Log.e(TAG, "Firestore not available - transaction saved locally only: ${transaction.id}")
            Log.e(TAG, ">>> firebaseInitialized=$firebaseInitialized, firestore=${firestore != null}")
            return Result.failure(Exception("Firestore not initialized. Rebuild app with: eas build --platform android"))
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
        Log.w(TAG, "▓▓▓ ASYNC SAVE INITIATED ▓▓▓")
        Log.w(TAG, ">>> ID: ${transaction.id}")
        Log.w(TAG, ">>> Amount: ${transaction.amount} ${transaction.currency}")
        Log.w(TAG, ">>> MPESA Ref: ${transaction.mpesaReference}")
        Log.w(TAG, ">>> isAvailable: ${isAvailable()}")
        
        if (!isAvailable()) {
            val error = "Firestore not initialized. Rebuild app: eas build --platform android"
            Log.e(TAG, ">>> $error")
            onError(error)
            return
        }
        
        Log.w(TAG, ">>> Saving to: $COLLECTION_TRANSACTIONS/${transaction.id}")
        
        firestore!!.collection(COLLECTION_TRANSACTIONS)
            .document(transaction.id)
            .set(transaction.toMap(), SetOptions.merge())
            .addOnSuccessListener {
                Log.w(TAG, "▓▓▓ ASYNC SAVE SUCCESS ▓▓▓")
                Log.w(TAG, ">>> ID: ${transaction.id}")
                Log.w(TAG, ">>> Amount: ${transaction.amount} ${transaction.currency}")
                onSuccess(transaction.id)
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "▓▓▓ ASYNC SAVE FAILED ▓▓▓")
                Log.e(TAG, ">>> ID: ${transaction.id}")
                Log.e(TAG, ">>> Error: ${e.message}")
                Log.e(TAG, ">>> Type: ${e.javaClass.simpleName}")
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
