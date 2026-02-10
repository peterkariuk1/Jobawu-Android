package expo.modules.equitysms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the SMS listener running in the background.
 * This service registers the SmsReceiver, processes transactions locally,
 * and syncs to Firestore when online. Works independently of JavaScript.
 */
class SmsListenerService : Service() {

    companion object {
        private const val TAG = "SmsListenerService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "equity_sms_channel"
        private const val CHANNEL_NAME = "Equity SMS Reconciliation"
        
        // Static reference for event forwarding to JS module
        var eventListener: ServiceEventListener? = null
    }

    interface ServiceEventListener {
        fun onSmsReceived(transaction: TransactionData)
        fun onTransactionSaved(transactionId: String, transaction: TransactionData)
        fun onError(error: String, type: String, transaction: TransactionData? = null)
    }

    private var smsReceiver: SmsReceiver? = null
    private lateinit var localStore: LocalTransactionStore
    private lateinit var firestoreRepository: FirestoreRepository
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "====== SMS LISTENER SERVICE CREATED ======")
        
        // Initialize local storage and Firestore
        Log.d(TAG, "Initializing LocalTransactionStore...")
        localStore = LocalTransactionStore(applicationContext)
        Log.d(TAG, "LocalTransactionStore initialized")
        
        Log.d(TAG, "Initializing FirestoreRepository...")
        firestoreRepository = FirestoreRepository(applicationContext)
        Log.d(TAG, "FirestoreRepository initialized, available: ${firestoreRepository.isAvailable()}")
        
        createNotificationChannel()
        setupNetworkMonitoring()
        Log.d(TAG, "==========================================")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "====== SMS LISTENER SERVICE STARTED ======")
        Log.d(TAG, "Intent: $intent")
        Log.d(TAG, "Start ID: $startId")
        
        // Start as foreground service with notification
        startForeground(NOTIFICATION_ID, createNotification())
        Log.d(TAG, "Foreground service started with notification")
        
        // Register SMS receiver and set up listener
        registerSmsReceiver()
        setupSmsProcessing()
        
        // Log current state
        Log.d(TAG, "SmsReceiver.smsListener is null: ${SmsReceiver.smsListener == null}")
        Log.d(TAG, "eventListener is null: ${eventListener == null}")
        
        // Sync any pending transactions
        syncPendingTransactions()
        
        Log.d(TAG, "Returning START_STICKY")
        Log.d(TAG, "==========================================")
        
        // Return START_STICKY to ensure the service restarts if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "SmsListenerService destroyed")
        unregisterSmsReceiver()
        unregisterNetworkCallback()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors incoming SMS for rent payment reconciliation"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        // Create an intent to open the app when notification is tapped
        val packageManager = packageManager
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val pendingCount = localStore.getPendingTransactions().size
        val statusText = if (pendingCount > 0) {
            "Monitoring SMS • $pendingCount pending sync"
        } else {
            "Monitoring for rent payment notifications"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jobawu SMS Reconciliation")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    private fun registerSmsReceiver() {
        try {
            if (smsReceiver == null) {
                smsReceiver = SmsReceiver()
                val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
                    priority = IntentFilter.SYSTEM_HIGH_PRIORITY
                }
                registerReceiver(smsReceiver, filter)
                Log.d(TAG, "SMS receiver registered successfully")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register SMS receiver: ${e.message}")
        }
    }

    private fun unregisterSmsReceiver() {
        try {
            smsReceiver?.let {
                unregisterReceiver(it)
                smsReceiver = null
                Log.d(TAG, "SMS receiver unregistered successfully")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister SMS receiver: ${e.message}")
        }
    }

    /**
     * Sets up the SMS processing pipeline - this is the key fix.
     * The listener is now set up directly in the service, not via JavaScript.
     */
    private fun setupSmsProcessing() {
        Log.d(TAG, "Setting up SMS processing pipeline...")
        
        SmsReceiver.smsListener = object : SmsReceiver.SmsListener {
            override fun onSmsReceived(transaction: TransactionData) {
                Log.d(TAG, "====== TRANSACTION RECEIVED IN SERVICE ======")
                Log.d(TAG, "Transaction ID: ${transaction.id}")
                Log.d(TAG, "Amount: ${transaction.amount} ${transaction.currency}")
                Log.d(TAG, "MPESA Ref: ${transaction.mpesaReference}")
                Log.d(TAG, "Sender: ${transaction.senderName}")
                Log.d(TAG, "==============================================")
                processTransaction(transaction)
            }

            override fun onSmsError(error: String) {
                Log.e(TAG, "SMS processing error from receiver: $error")
                eventListener?.onError(error, "sms_processing_error")
            }
        }
        
        Log.d(TAG, "✓ SMS processing pipeline set up successfully")
        Log.d(TAG, "SmsReceiver.smsListener is now: ${if (SmsReceiver.smsListener != null) "SET" else "NULL"}")
    }

    /**
     * Processes a new transaction - saves locally first, then syncs to Firestore.
     */
    private fun processTransaction(transaction: TransactionData) {
        Log.d(TAG, "====== PROCESSING TRANSACTION ======")
        Log.d(TAG, "Transaction: ${transaction.id}")
        
        // Step 1: Save locally first (offline-first approach)
        Log.d(TAG, "Step 1: Saving transaction locally...")
        val savedLocally = localStore.savePendingTransaction(transaction)
        
        if (!savedLocally) {
            Log.d(TAG, "Transaction already exists locally, skipping")
            return
        }
        Log.d(TAG, "✓ Transaction saved locally")
        
        // Notify JS listener if available
        Log.d(TAG, "Step 2: Notifying JS listener (if available)...")
        if (eventListener != null) {
            eventListener?.onSmsReceived(transaction)
            Log.d(TAG, "✓ JS listener notified")
        } else {
            Log.d(TAG, "JS listener is null - app may not be in foreground")
        }
        
        // Update notification to show pending count
        updateNotification()
        
        // Step 3: Try to sync to Firestore if online
        Log.d(TAG, "Step 3: Checking network for Firestore sync...")
        if (isNetworkAvailable()) {
            Log.d(TAG, "Network available - syncing to Firestore")
            syncTransactionToFirestore(transaction)
        } else {
            Log.d(TAG, "Offline - transaction saved locally for later sync: ${transaction.id}")
        }
        
        Log.d(TAG, "====== TRANSACTION PROCESSING COMPLETE ======")
    }

    /**
     * Syncs a single transaction to Firestore.
     */
    private fun syncTransactionToFirestore(transaction: TransactionData) {
        Log.d(TAG, "Syncing transaction to Firestore: ${transaction.id}")
        Log.d(TAG, "Firestore available: ${firestoreRepository.isAvailable()}")
        
        firestoreRepository.saveTransactionAsync(
            transaction,
            onSuccess = { id ->
                Log.d(TAG, "✓ FIRESTORE SUCCESS: Transaction synced: $id")
                localStore.markAsSynced(transaction.id)
                updateNotification()
                if (eventListener != null) {
                    eventListener?.onTransactionSaved(id, transaction)
                    Log.d(TAG, "JS event listener notified of save")
                }
            },
            onError = { error ->
                Log.e(TAG, "✗ FIRESTORE FAILED: $error")
                Log.e(TAG, "Transaction will remain in pending state for retry")
                eventListener?.onError(error, "firestore_save_failed", transaction)
            }
        )
    }

    /**
     * Syncs all pending transactions to Firestore.
     */
    private fun syncPendingTransactions() {
        Log.d(TAG, "====== SYNC PENDING TRANSACTIONS ======")
        
        if (!isNetworkAvailable()) {
            Log.d(TAG, "Offline - skipping sync of pending transactions")
            return
        }
        
        val pending = localStore.getPendingTransactions()
        Log.d(TAG, "Found ${pending.size} pending transactions to sync")
        
        if (pending.isEmpty()) {
            Log.d(TAG, "No pending transactions")
            return
        }
        
        for (transaction in pending) {
            syncTransactionToFirestore(transaction)
        }
    }

    /**
     * Sets up network monitoring to sync when connectivity is restored.
     */
    private fun setupNetworkMonitoring() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.d(TAG, "Network available - syncing pending transactions")
                    syncPendingTransactions()
                }

                override fun onLost(network: Network) {
                    Log.d(TAG, "Network lost - transactions will be synced when online")
                }
            }
            
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            
            connectivityManager?.registerNetworkCallback(request, networkCallback!!)
        }
    }

    private fun unregisterNetworkCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            networkCallback?.let {
                try {
                    connectivityManager?.unregisterNetworkCallback(it)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to unregister network callback: ${e.message}")
                }
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = connectivityManager ?: return false
        
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = cm.activeNetwork ?: return false
            val capabilities = cm.getNetworkCapabilities(network) ?: return false
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } else {
            @Suppress("DEPRECATION")
            cm.activeNetworkInfo?.isConnected == true
        }
    }
}
