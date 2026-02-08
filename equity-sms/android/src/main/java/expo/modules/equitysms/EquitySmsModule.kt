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

        // Start the SMS listener service
        AsyncFunction("startListening") {
            Log.d(TAG, "Starting SMS listener service")
            
            if (!hasRequiredPermissions()) {
                throw Exception("Required permissions not granted. Please grant SMS and notification permissions.")
            }
            
            try {
                val serviceIntent = Intent(context, SmsListenerService::class.java)
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                
                // Set up the SMS listener to forward events to JS
                setupSmsListener()
                
                sendEvent("onServiceStatusChanged", mapOf(
                    "status" to "started",
                    "message" to "SMS listener service started successfully"
                ))
                
                mapOf("success" to true, "message" to "SMS listener started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start SMS listener: ${e.message}")
                throw Exception("Failed to start SMS listener: ${e.message}")
            }
        }

        // Stop the SMS listener service
        AsyncFunction("stopListening") {
            Log.d(TAG, "Stopping SMS listener service")
            
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

        // Get unreconciled transactions
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

    private fun setupSmsListener() {
        SmsReceiver.smsListener = object : SmsReceiver.SmsListener {
            override fun onSmsReceived(transaction: TransactionData) {
                Log.d(TAG, "SMS received and parsed: ${transaction.id}")
                
                // Send event to JavaScript immediately
                sendEvent("onSmsReceived", mapOf(
                    "transaction" to transaction.toMap()
                ))
                
                // Save to Firestore
                firestoreRepository.saveTransactionAsync(
                    transaction,
                    onSuccess = { id ->
                        Log.d(TAG, "Transaction saved to Firestore: $id")
                        sendEvent("onTransactionSaved", mapOf(
                            "success" to true,
                            "transactionId" to id,
                            "transaction" to transaction.toMap()
                        ))
                    },
                    onError = { error ->
                        Log.e(TAG, "Failed to save to Firestore: $error")
                        sendEvent("onError", mapOf(
                            "error" to error,
                            "type" to "firestore_save_failed",
                            "transaction" to transaction.toMap()
                        ))
                    }
                )
            }

            override fun onSmsError(error: String) {
                Log.e(TAG, "SMS processing error: $error")
                sendEvent("onError", mapOf(
                    "error" to error,
                    "type" to "sms_processing_error"
                ))
            }
        }
    }

    private fun hasRequiredPermissions(): Boolean {
        return hasSmsPermission()
    }

    private fun hasSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }
}
