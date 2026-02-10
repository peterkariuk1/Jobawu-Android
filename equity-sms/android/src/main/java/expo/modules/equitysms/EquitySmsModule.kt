package expo.modules.equitysms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class EquitySmsModule : Module() {

    companion object {
        private const val TAG = "EquitySmsModule"
    }

    private val context: Context
        get() = requireNotNull(appContext.reactContext)

    private val firestoreRepository: FirestoreRepository by lazy {
        FirestoreRepository(context)
    }

    private val localStore: LocalTransactionStore by lazy {
        LocalTransactionStore(context)
    }

    private val coroutineScope = CoroutineScope(Dispatchers.IO)

    override fun definition() = ModuleDefinition {
        Name("EquitySms")

        // Events that can be sent to JavaScript
        Events(
            "onSmsReceived",
            "onTransactionSaved",
            "onError",
            "onServiceStatusChanged"
        )

        // Called when the module is created - auto-start the service
        OnCreate {
            Log.d(TAG, "====== EQUITY SMS MODULE CREATED ======")
            Log.d(TAG, "Setting up service event listener...")
            setupServiceEventListener()
            Log.d(TAG, "Checking for auto-start...")
            autoStartServiceIfPermitted()
            Log.d(TAG, "==========================================")
        }

        // Start the SMS listener service (kept for manual restart if needed)
        AsyncFunction("startListening") {
            Log.d(TAG, "startListening() called from JavaScript")
            
            if (!hasRequiredPermissions()) {
                Log.e(TAG, "Permissions not granted!")
                throw Exception("Required permissions not granted. Please grant SMS and notification permissions.")
            }
            
            try {
                Log.d(TAG, "Starting service...")
                startService()
                
                sendEvent("onServiceStatusChanged", mapOf(
                    "status" to "started",
                    "message" to "SMS listener service started successfully"
                ))
                
                Log.d(TAG, "✓ Service started successfully")
                mapOf("success" to true, "message" to "SMS listener started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start SMS listener: ${e.message}")
                e.printStackTrace()
                throw Exception("Failed to start SMS listener: ${e.message}")
            }
        }

        // Stop the SMS listener service
        AsyncFunction("stopListening") {
            Log.d(TAG, "stopListening() called from JavaScript")
            
            try {
                val serviceIntent = Intent(context, SmsListenerService::class.java)
                context.stopService(serviceIntent)
                
                SmsReceiver.smsListener = null
                
                sendEvent("onServiceStatusChanged", mapOf(
                    "status" to "stopped",
                    "message" to "SMS listener service stopped"
                ))
                
                mapOf("success" to true, "message" to "SMS listener stopped")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop SMS listener: ${e.message}")
                throw Exception("Failed to stop SMS listener: ${e.message}")
            }
        }

        // Check if service is running
        Function("isListening") {
            // Check if service is running by checking if the listener is set
            SmsReceiver.smsListener != null
        }

        // Check required permissions
        Function("checkPermissions") {
            mapOf(
                "sms" to hasSmsPermission(),
                "bootCompleted" to true, // Always granted if declared in manifest
                "foregroundService" to true, // Always granted if declared in manifest
                "allGranted" to hasRequiredPermissions()
            )
        }

        // Get required permissions list
        Function("getRequiredPermissions") {
            listOf(
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_SMS
            )
        }

        // Manually save a transaction (for testing)
        AsyncFunction("saveTransaction") { transactionJson: Map<String, Any?> ->
            Log.d(TAG, "Manually saving transaction")
            
            try {
                val transaction = TransactionData.fromMap(transactionJson)
                
                coroutineScope.launch {
                    val result = firestoreRepository.saveTransaction(transaction)
                    result.fold(
                        onSuccess = { id ->
                            sendEvent("onTransactionSaved", mapOf(
                                "success" to true,
                                "transactionId" to id,
                                "transaction" to transaction.toMap()
                            ))
                        },
                        onFailure = { error ->
                            sendEvent("onError", mapOf(
                                "error" to (error.message ?: "Unknown error"),
                                "type" to "save_failed"
                            ))
                        }
                    )
                }
                
                mapOf("success" to true, "message" to "Transaction save initiated")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save transaction: ${e.message}")
                throw Exception("Failed to save transaction: ${e.message}")
            }
        }

        // Parse an SMS message (for testing)
        Function("parseSms") { smsBody: String, sender: String ->
            Log.d(TAG, "Parsing SMS: $smsBody")
            
            val transaction = SmsParser.parseEquityBankSms(smsBody, sender)
            transaction?.toMap()
        }

        // Get unreconciled transactions from Firestore
        AsyncFunction("getUnreconciledTransactions") { promise: Promise ->
            coroutineScope.launch {
                val result = firestoreRepository.getUnreconciledTransactions()
                result.fold(
                    onSuccess = { transactions ->
                        promise.resolve(transactions.map { it.toMap() })
                    },
                    onFailure = { error ->
                        promise.reject("FETCH_ERROR", error.message ?: "Failed to fetch transactions", error)
                    }
                )
            }
        }

        // Get all local transactions (pending + synced) - works offline
        Function("getLocalTransactions") {
            localStore.getAllTransactions().map { it.toMap() }
        }

        // Get pending transactions (not yet synced to Firestore)
        Function("getPendingTransactions") {
            localStore.getPendingTransactions().map { it.toMap() }
        }

        // Mark transaction as reconciled
        AsyncFunction("markAsReconciled") { transactionId: String, promise: Promise ->
            coroutineScope.launch {
                val result = firestoreRepository.markAsReconciled(transactionId)
                result.fold(
                    onSuccess = {
                        promise.resolve(mapOf("success" to true, "transactionId" to transactionId))
                    },
                    onFailure = { error ->
                        promise.reject("UPDATE_ERROR", error.message ?: "Failed to update transaction", error)
                    }
                )
            }
        }

        // Get transaction by ID
        AsyncFunction("getTransaction") { transactionId: String, promise: Promise ->
            coroutineScope.launch {
                val result = firestoreRepository.getTransaction(transactionId)
                result.fold(
                    onSuccess = { transaction ->
                        promise.resolve(transaction?.toMap())
                    },
                    onFailure = { error ->
                        promise.reject("FETCH_ERROR", error.message ?: "Failed to fetch transaction", error)
                    }
                )
            }
        }
    }

    /**
     * Sets up the event listener to forward service events to JavaScript.
     */
    private fun setupServiceEventListener() {
        Log.d(TAG, "Setting up ServiceEventListener...")
        
        SmsListenerService.eventListener = object : SmsListenerService.ServiceEventListener {
            override fun onSmsReceived(transaction: TransactionData) {
                Log.d(TAG, "====== EVENT: SMS RECEIVED ======")
                Log.d(TAG, "Transaction ID: ${transaction.id}")
                Log.d(TAG, "Amount: ${transaction.amount}")
                Log.d(TAG, "Forwarding to JavaScript...")
                sendEvent("onSmsReceived", mapOf(
                    "transaction" to transaction.toMap()
                ))
                Log.d(TAG, "✓ Event sent to JavaScript")
            }

            override fun onTransactionSaved(transactionId: String, transaction: TransactionData) {
                Log.d(TAG, "====== EVENT: TRANSACTION SAVED ======")
                Log.d(TAG, "Transaction ID: $transactionId")
                sendEvent("onTransactionSaved", mapOf(
                    "success" to true,
                    "transactionId" to transactionId,
                    "transaction" to transaction.toMap()
                ))
                Log.d(TAG, "✓ Event sent to JavaScript")
            }

            override fun onError(error: String, type: String, transaction: TransactionData?) {
                Log.e(TAG, "====== EVENT: ERROR ======")
                Log.e(TAG, "Error: $error")
                Log.e(TAG, "Type: $type")
                val eventData = mutableMapOf<String, Any?>(
                    "error" to error,
                    "type" to type
                )
                transaction?.let { eventData["transaction"] = it.toMap() }
                sendEvent("onError", eventData)
            }
        }
        
        Log.d(TAG, "✓ ServiceEventListener set up successfully")
    }

    /**
     * Auto-starts the service if permissions are already granted.
     * This ensures the service runs immediately when the app loads.
     */
    private fun autoStartServiceIfPermitted() {
        Log.d(TAG, "Checking if auto-start is possible...")
        Log.d(TAG, "SMS permission granted: ${hasSmsPermission()}")
        
        if (hasRequiredPermissions()) {
            try {
                Log.d(TAG, "Permissions OK - auto-starting service...")
                startService()
                Log.d(TAG, "✓ Service auto-started successfully")
            } catch (e: Exception) {
                Log.e(TAG, "✗ Failed to auto-start service: ${e.message}")
                e.printStackTrace()
            }
        } else {
            Log.d(TAG, "Permissions not granted - service will start after permission grant")
        }
    }

    /**
     * Helper to start the service.
     */
    private fun startService() {
        Log.d(TAG, "startService() called")
        val serviceIntent = Intent(context, SmsListenerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Log.d(TAG, "Using startForegroundService (Android O+)")
            context.startForegroundService(serviceIntent)
        } else {
            Log.d(TAG, "Using startService (pre-Android O)")
            context.startService(serviceIntent)
        }
        Log.d(TAG, "Service intent sent")
    }

    private fun hasRequiredPermissions(): Boolean {
        val result = hasSmsPermission()
        Log.d(TAG, "hasRequiredPermissions() = $result")
        return result
    }

    private fun hasSmsPermission(): Boolean {
        val receiveSms = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED
        
        val readSms = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
        
        Log.d(TAG, "hasSmsPermission: RECEIVE_SMS=$receiveSms, READ_SMS=$readSms")
        return receiveSms && readSms
    }
}
