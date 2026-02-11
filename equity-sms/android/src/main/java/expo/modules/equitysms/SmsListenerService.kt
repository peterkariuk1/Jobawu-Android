package expo.modules.equitysms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the SMS listener running in the background.
 * This service registers the SmsReceiver, processes transactions locally,
 * and syncs to Firestore when online. Works independently of JavaScript.
 * 
 * Features:
 * - START_STICKY for automatic restart if killed
 * - Wake lock for reliable SMS processing
 * - Network monitoring for automatic sync when online
 * - Comprehensive logging for debugging
 */
class SmsListenerService : Service() {

    companion object {
        private const val TAG = "SmsListenerService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "equity_sms_channel"
        private const val CHANNEL_NAME = "Equity SMS Reconciliation"
        private const val PREFS_NAME = "equity_sms_prefs"
        private const val KEY_SERVICE_ENABLED = "service_enabled"
        private const val WAKE_LOCK_TAG = "EquitySms:ServiceWakeLock"
        
        // Static reference for event forwarding to JS module
        var eventListener: ServiceEventListener? = null
        
        // Track if service is running
        var isServiceRunning = false
            private set
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
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "╔═══════════════════════════════════════════╗")
        Log.i(TAG, "║     SMS LISTENER SERVICE CREATED          ║")
        Log.i(TAG, "╚═══════════════════════════════════════════╝")
        Log.d(TAG, "Timestamp: ${System.currentTimeMillis()}")
        Log.d(TAG, "Package: ${applicationContext.packageName}")
        
        // Initialize local storage and Firestore
        Log.d(TAG, "Step 1: Initializing LocalTransactionStore...")
        localStore = LocalTransactionStore(applicationContext)
        Log.d(TAG, "✓ LocalTransactionStore initialized")
        
        Log.d(TAG, "Step 2: Initializing FirestoreRepository...")
        firestoreRepository = FirestoreRepository(applicationContext)
        Log.d(TAG, "✓ FirestoreRepository initialized, available: ${firestoreRepository.isAvailable()}")
        
        Log.d(TAG, "Step 3: Creating notification channel...")
        createNotificationChannel()
        Log.d(TAG, "✓ Notification channel created")
        
        Log.d(TAG, "Step 4: Setting up network monitoring...")
        setupNetworkMonitoring()
        Log.d(TAG, "✓ Network monitoring set up")
        
        // Mark service as enabled for boot receiver
        markServiceEnabled(true)
        
        isServiceRunning = true
        Log.i(TAG, "══════════════════════════════════════════════")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "╔═══════════════════════════════════════════╗")
        Log.i(TAG, "║     SMS LISTENER SERVICE STARTED          ║")
        Log.i(TAG, "╚═══════════════════════════════════════════╝")
        Log.d(TAG, "Start ID: $startId")
        Log.d(TAG, "Intent action: ${intent?.action}")
        Log.d(TAG, "Started from boot: ${intent?.getBooleanExtra("started_from_boot", false)}")
        
        // Acquire wake lock for reliable processing
        acquireWakeLock()
        
        // Start as foreground service with notification
        Log.d(TAG, "Step A: Starting foreground with notification...")
        startForeground(NOTIFICATION_ID, createNotification())
        Log.d(TAG, "✓ Foreground service started")
        
        // Set up SMS processing pipeline FIRST so listener is ready before broadcasts arrive
        Log.d(TAG, "Step B: Setting up SMS processing pipeline...")
        setupSmsProcessing()
        Log.d(TAG, "✓ SMS processing pipeline ready")
        
        // THEN register the dynamic SMS receiver (broadcasts will find listener set)
        Log.d(TAG, "Step C: Registering SMS receiver...")
        registerSmsReceiver()
        Log.d(TAG, "✓ SMS receiver registered")
        
        // Log current state
        Log.d(TAG, "──────────────────────────────────────────────")
        Log.d(TAG, "Service State Summary:")
        Log.d(TAG, "  • SmsReceiver.smsListener: ${if (SmsReceiver.smsListener != null) "SET ✓" else "NULL ✗"}")
        Log.d(TAG, "  • eventListener (JS): ${if (eventListener != null) "SET ✓" else "NULL (app may be closed)"}")
        Log.d(TAG, "  • Firestore: ${if (firestoreRepository.isAvailable()) "AVAILABLE ✓" else "UNAVAILABLE ✗"}")
        Log.d(TAG, "  • Network: ${if (isNetworkAvailable()) "ONLINE ✓" else "OFFLINE"}")
        Log.d(TAG, "──────────────────────────────────────────────")
        
        // Sync any pending transactions
        Log.d(TAG, "Step D: Syncing pending transactions...")
        syncPendingTransactions()
        
        Log.i(TAG, "══════════════════════════════════════════════")
        Log.i(TAG, "SERVICE IS NOW LISTENING FOR SMS")
        Log.i(TAG, "══════════════════════════════════════════════")
        
        // Return START_STICKY to ensure the service restarts if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        Log.w(TAG, "╔═══════════════════════════════════════════╗")
        Log.w(TAG, "║     SMS LISTENER SERVICE DESTROYED        ║")
        Log.w(TAG, "╚═══════════════════════════════════════════╝")
        
        isServiceRunning = false
        releaseWakeLock()
        unregisterSmsReceiver()
        unregisterNetworkCallback()
        
        // Note: Don't mark service as disabled here, as it might be killed by system
        // and we want boot receiver to restart it
        
        Log.w(TAG, "Service cleanup complete")
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(TAG, "onTaskRemoved called - app was closed by user")
        Log.d(TAG, "Service will continue running in background")
        super.onTaskRemoved(rootIntent)
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    WAKE_LOCK_TAG
                ).apply {
                    setReferenceCounted(false)
                }
            }
            wakeLock?.acquire(10 * 60 * 1000L) // 10 minutes max
            Log.d(TAG, "✓ Wake lock acquired")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "✓ Wake lock released")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release wake lock: ${e.message}")
        }
    }

    private fun markServiceEnabled(enabled: Boolean) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_SERVICE_ENABLED, enabled).apply()
        Log.d(TAG, "Service enabled preference set to: $enabled")
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
            Log.d(TAG, "Notification channel created: $CHANNEL_ID")
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
        val syncedCount = localStore.getSyncedTransactions().size
        val statusText = when {
            pendingCount > 0 -> "Listening • $pendingCount pending sync"
            syncedCount > 0 -> "Listening • $syncedCount transactions synced"
            else -> "Listening for rent payment SMS"
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
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, createNotification())
            Log.d(TAG, "Notification updated")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update notification: ${e.message}")
        }
    }

    private fun registerSmsReceiver() {
        Log.w(TAG, "▓▓▓ registerSmsReceiver() called ▓▓▓")
        try {
            if (smsReceiver == null) {
                Log.w(TAG, ">>> Creating new SmsReceiver instance")
                smsReceiver = SmsReceiver()
                val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
                    priority = IntentFilter.SYSTEM_HIGH_PRIORITY
                }
                Log.w(TAG, ">>> Intent filter: ${Telephony.Sms.Intents.SMS_RECEIVED_ACTION}")
                Log.w(TAG, ">>> Priority: SYSTEM_HIGH_PRIORITY")
                // Android 13+ (TIRAMISU) requires RECEIVER_EXPORTED for system broadcasts
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(smsReceiver, filter, Context.RECEIVER_EXPORTED)
                    Log.w(TAG, ">>> ✓ Registered with RECEIVER_EXPORTED (Android 13+)")
                } else {
                    registerReceiver(smsReceiver, filter)
                    Log.w(TAG, ">>> ✓ Registered (pre-Android 13)")
                }
            } else {
                Log.w(TAG, ">>> SMS receiver already exists, skipping")
            }
        } catch (e: Exception) {
            Log.e(TAG, ">>> ✗ FAILED to register SMS receiver: ${e.message}")
            e.printStackTrace()
        }
    }

    private fun unregisterSmsReceiver() {
        try {
            smsReceiver?.let {
                unregisterReceiver(it)
                smsReceiver = null
                SmsReceiver.smsListener = null
                Log.i(TAG, "✓ SMS receiver unregistered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister SMS receiver: ${e.message}")
        }
    }

    /**
     * Sets up the SMS processing pipeline - this is the key component.
     * The listener is set up directly in the service, works independently of JavaScript.
     */
    private fun setupSmsProcessing() {
        Log.w(TAG, "▓▓▓ setupSmsProcessing() called ▓▓▓")
        Log.w(TAG, ">>> Setting SmsReceiver.smsListener...")
        
        SmsReceiver.smsListener = object : SmsReceiver.SmsListener {
            override fun onSmsReceived(transaction: TransactionData) {
                Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
                Log.w(TAG, "▓▓▓  SERVICE: TRANSACTION FROM RECEIVER!  ▓▓▓")
                Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
                Log.w(TAG, ">>> Transaction ID: ${transaction.id}")
                Log.w(TAG, ">>> Amount: ${transaction.amount} ${transaction.currency}")
                Log.w(TAG, ">>> MPESA Ref: ${transaction.mpesaReference}")
                Log.w(TAG, ">>> Sender: ${transaction.senderName}")
                Log.w(TAG, ">>> Calling processTransaction...")
                
                processTransaction(transaction)
            }

            override fun onSmsError(error: String) {
                Log.e(TAG, ">>> SERVICE: SMS ERROR: $error")
                eventListener?.onError(error, "sms_processing_error")
            }
        }
        
        Log.w(TAG, ">>> ✓ SmsReceiver.smsListener is now SET")
        Log.w(TAG, ">>> smsListener null check: ${SmsReceiver.smsListener != null}")
    }

    /**
     * Processes a new transaction - saves locally first, then syncs to Firestore.
     * This is the core offline-first processing logic.
     */
    private fun processTransaction(transaction: TransactionData) {
        Log.w(TAG, "▓▓▓ processTransaction() called ▓▓▓")
        Log.w(TAG, ">>> Transaction ID: ${transaction.id}")
        
        // Step 1: Save locally first (offline-first approach)
        Log.w(TAG, ">>> Step 1: Saving to local storage...")
        val savedLocally = localStore.savePendingTransaction(transaction)
        
        if (!savedLocally) {
            Log.w(TAG, ">>> Already exists locally (duplicate), skipping")
            return
        }
        Log.w(TAG, ">>> ✓ Saved to local storage")
        
        // Step 2: Notify JS listener if available (app in foreground)
        Log.w(TAG, ">>> Step 2: Notifying JS listener...")
        Log.w(TAG, ">>> eventListener is: ${eventListener}")
        if (eventListener != null) {
            eventListener?.onSmsReceived(transaction)
            Log.w(TAG, ">>> ✓ JS listener notified")
        } else {
            Log.w(TAG, ">>> JS listener is null (app closed/background)")
        }
        
        // Update notification to show pending count
        updateNotification()
        
        // Step 3: Try to sync to Firestore if online
        Log.w(TAG, ">>> Step 3: Checking network for Firestore...")
        Log.w(TAG, ">>> Network available: ${isNetworkAvailable()}")
        Log.w(TAG, ">>> Firestore available: ${firestoreRepository.isAvailable()}")
        
        if (isNetworkAvailable()) {
            Log.w(TAG, ">>> Calling syncTransactionToFirestore...")
            syncTransactionToFirestore(transaction)
        } else {
            Log.w(TAG, ">>> OFFLINE - queued for later sync")
        }
        
        Log.w(TAG, "▓▓▓ processTransaction() done ▓▓▓")
    }

    /**
     * Syncs a single transaction to Firestore.
     */
    private fun syncTransactionToFirestore(transaction: TransactionData) {
        Log.w(TAG, ">>> syncTransactionToFirestore: ${transaction.id}")
        
        if (!firestoreRepository.isAvailable()) {
            Log.e(TAG, ">>> ✗ Firestore NOT available!")
            return
        }
        
        Log.w(TAG, ">>> Calling firestoreRepository.saveTransactionAsync...")
        firestoreRepository.saveTransactionAsync(
            transaction,
            onSuccess = { id ->
                Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
                Log.w(TAG, "▓▓▓  FIRESTORE SUCCESS!                    ▓▓▓")
                Log.w(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
                Log.w(TAG, ">>> ID: $id")
                Log.w(TAG, ">>> Amount: ${transaction.amount}")
                
                localStore.markAsSynced(transaction.id)
                updateNotification()
                
                if (eventListener != null) {
                    eventListener?.onTransactionSaved(id, transaction)
                    Log.w(TAG, ">>> JS notified of Firestore save")
                }
            },
            onError = { error ->
                Log.e(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
                Log.e(TAG, "▓▓▓  FIRESTORE FAILED!                     ▓▓▓")
                Log.e(TAG, "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
                Log.e(TAG, ">>> Error: $error")
                
                eventListener?.onError(error, "firestore_save_failed", transaction)
            }
        )
    }

    /**
     * Syncs all pending transactions to Firestore.
     * Called on service start and when network becomes available.
     */
    private fun syncPendingTransactions() {
        Log.d(TAG, "──────────────────────────────────────────────")
        Log.d(TAG, "SYNC PENDING TRANSACTIONS")
        
        if (!isNetworkAvailable()) {
            Log.d(TAG, "OFFLINE - Skipping sync of pending transactions")
            return
        }
        
        if (!firestoreRepository.isAvailable()) {
            Log.w(TAG, "Firestore not available - skipping sync")
            return
        }
        
        val pending = localStore.getPendingTransactions()
        Log.d(TAG, "Found ${pending.size} pending transaction(s)")
        
        if (pending.isEmpty()) {
            Log.d(TAG, "No pending transactions to sync")
            return
        }
        
        Log.i(TAG, "Syncing ${pending.size} pending transaction(s) to Firestore...")
        
        for ((index, transaction) in pending.withIndex()) {
            Log.d(TAG, "Syncing ${index + 1}/${pending.size}: ${transaction.id}")
            syncTransactionToFirestore(transaction)
        }
        
        Log.d(TAG, "──────────────────────────────────────────────")
    }

    /**
     * Sets up network monitoring to sync when connectivity is restored.
     * This ensures pending transactions are synced as soon as the device goes online.
     */
    private fun setupNetworkMonitoring() {
        Log.d(TAG, "Setting up network monitoring...")
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.i(TAG, "════════════════════════════════════════════")
                    Log.i(TAG, "NETWORK AVAILABLE - Syncing pending transactions")
                    Log.i(TAG, "════════════════════════════════════════════")
                    syncPendingTransactions()
                }

                override fun onLost(network: Network) {
                    Log.w(TAG, "────────────────────────────────────────────")
                    Log.w(TAG, "NETWORK LOST - Transactions will sync when online")
                    Log.w(TAG, "────────────────────────────────────────────")
                }

                override fun onCapabilitiesChanged(
                    network: Network,
                    capabilities: NetworkCapabilities
                ) {
                    val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    Log.d(TAG, "Network capabilities changed - hasInternet: $hasInternet")
                }
            }
            
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            
            try {
                connectivityManager?.registerNetworkCallback(request, networkCallback!!)
                Log.i(TAG, "✓ Network callback registered")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to register network callback: ${e.message}")
            }
        } else {
            Log.d(TAG, "Network callback not available on this Android version")
        }
    }

    private fun unregisterNetworkCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            networkCallback?.let {
                try {
                    connectivityManager?.unregisterNetworkCallback(it)
                    Log.d(TAG, "✓ Network callback unregistered")
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
            val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            val hasValidated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            Log.d(TAG, "Network check - hasInternet: $hasInternet, hasValidated: $hasValidated")
            hasInternet && hasValidated
        } else {
            @Suppress("DEPRECATION")
            val isConnected = cm.activeNetworkInfo?.isConnected == true
            Log.d(TAG, "Network check (legacy) - isConnected: $isConnected")
            isConnected
        }
    }
}
