import EquitySmsModule, {
    ErrorEvent,
    PermissionStatus,
    ServiceStatusEvent,
    SmsReceivedEvent,
    TransactionData,
    TransactionSavedEvent,
} from 'equity-sms';
import { useCallback, useEffect, useState } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import {
    getUnreconciledTransactions as fetchUnreconciled,
    markTransactionReconciled,
    saveTransactionToFirestore,
} from '../services/firestore-service';

interface UseEquitySmsReturn {
  /** Whether the SMS listener service is currently running */
  isListening: boolean;
  /** Current permission status */
  permissions: PermissionStatus | null;
  /** Recent transactions received via SMS (from local storage + live) */
  transactions: TransactionData[];
  /** Pending transactions not yet synced to Firestore */
  pendingTransactions: TransactionData[];
  /** Last error that occurred */
  lastError: string | null;
  /** Start the SMS listener service (usually auto-started) */
  startListening: () => Promise<void>;
  /** Stop the SMS listener service */
  stopListening: () => Promise<void>;
  /** Request required permissions */
  requestPermissions: () => Promise<boolean>;
  /** Get unreconciled transactions from Firestore */
  getUnreconciledTransactions: () => Promise<TransactionData[]>;
  /** Get local transactions (works offline) */
  getLocalTransactions: () => TransactionData[];
  /** Refresh local transactions from storage */
  refreshLocalTransactions: () => void;
  /** Mark a transaction as reconciled */
  markAsReconciled: (transactionId: string) => Promise<boolean>;
  /** Parse an SMS message (for testing - does NOT save to Firebase) */
  parseSms: (smsBody: string, sender: string) => TransactionData | null;
  /** Parse an SMS and save to Firebase (for testing full flow) */
  testParseAndSave: (smsBody: string, sender: string) => Promise<TransactionData | null>;
}

/**
 * Hook for managing Equity Bank SMS reconciliation.
 *
 * KEY ARCHITECTURE:
 * - SMS reception + parsing: handled NATIVELY (equity-sms module)
 * - Firestore saves: handled on JS SIDE (firebase JS SDK)
 *
 * This bypasses the native google-services.json dependency entirely.
 * The native side only does SMS BroadcastReceiver + parser.
 * All Firestore operations go through firebaseConfig.ts → JS SDK.
 */
export function useEquitySms(): UseEquitySmsReturn {
  const [isListening, setIsListening] = useState(false);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<TransactionData[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  // Load local transactions on mount
  const refreshLocalTransactions = useCallback(() => {
    if (Platform.OS !== 'android') return;
    
    try {
      const local = EquitySmsModule.getLocalTransactions();
      const pending = EquitySmsModule.getPendingTransactions();
      setTransactions(local);
      setPendingTransactions(pending);
    } catch (error) {
      console.error('[EquitySms] Failed to load local transactions:', error);
    }
  }, []);

  // Check initial status and load transactions
  useEffect(() => {
    if (Platform.OS === 'android') {
      checkStatus();
      refreshLocalTransactions();
    }
  }, [refreshLocalTransactions]);

  // Sync any pending local transactions to Firestore on mount
  // Handles SMS received while app was closed (saved locally by native receiver)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const syncPendingToFirestore = async () => {
      try {
        const pending = EquitySmsModule.getPendingTransactions();
        if (!pending || pending.length === 0) return;

        console.log(`[EquitySms] Found ${pending.length} pending local transactions — syncing to Firestore...`);
        for (const txn of pending) {
          const result = await saveTransactionToFirestore(txn);
          if (result.success) {
            console.log(`[EquitySms] ✓ Synced pending: ${result.id}`);
          } else {
            console.error(`[EquitySms] ✗ Failed to sync: ${result.error}`);
          }
        }
        // Refresh state after sync
        refreshLocalTransactions();
      } catch (error) {
        console.error('[EquitySms] Sync pending to Firestore failed:', error);
      }
    };

    // Small delay to let native module initialize
    const timer = setTimeout(syncPendingToFirestore, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscriptions = [
      // When native side receives+parses an SMS → save to Firestore from JS
      EquitySmsModule.addListener('onSmsReceived', async (event: SmsReceivedEvent) => {
        console.log('[EquitySms] SMS received from native:', event.transaction.id);
        console.log('[EquitySms] Amount:', event.transaction.amount);

        // Add to local state immediately
        setTransactions((prev) => {
          const exists = prev.some(t => t.id === event.transaction.id);
          if (exists) return prev;
          return [event.transaction, ...prev];
        });

        // Save to Firestore via JS SDK (this works!)
        console.log('[EquitySms] Saving to Firestore via JS SDK...');
        const result = await saveTransactionToFirestore(event.transaction);
        if (result.success) {
          console.log('[EquitySms] ✓ Saved to Firestore:', result.id);
        } else {
          console.error('[EquitySms] ✗ Firestore save failed:', result.error);
          setLastError(`Firestore save failed: ${result.error}`);
        }

        // Refresh pending count
        try {
          setPendingTransactions(EquitySmsModule.getPendingTransactions());
        } catch (e) {
          console.error('[EquitySms] Failed to refresh pending:', e);
        }
      }),
      // Native Firestore save event (may or may not fire — we don't depend on it)
      EquitySmsModule.addListener('onTransactionSaved', (event: TransactionSavedEvent) => {
        console.log('[EquitySms] Native Firestore also saved:', event.transactionId);
        try {
          setPendingTransactions(EquitySmsModule.getPendingTransactions());
        } catch (e) {
          // non-critical
        }
      }),
      EquitySmsModule.addListener('onError', (event: ErrorEvent) => {
        // Only log native firestore errors, don't show to user since JS handles saves
        if (event.error?.includes?.('Firestore') || event.error?.includes?.('firestore')) {
          console.log('[EquitySms] Native Firestore error (handled by JS):', event.error);
        } else {
          console.error('[EquitySms] Error:', event.error);
          setLastError(event.error);
        }
      }),
      EquitySmsModule.addListener('onServiceStatusChanged', (event: ServiceStatusEvent) => {
        console.log('[EquitySms] Service status:', event.status);
        setIsListening(event.status === 'started');
      }),
    ];

    return () => {
      subscriptions.forEach((sub) => sub.remove());
    };
  }, []);

  const checkStatus = useCallback(() => {
    try {
      setIsListening(EquitySmsModule.isListening());
      setPermissions(EquitySmsModule.checkPermissions());
    } catch (error) {
      console.error('[EquitySms] Failed to check status:', error);
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'SMS listening is only available on Android');
      return false;
    }

    try {
      const permissions = EquitySmsModule.getRequiredPermissions();
      
      const results = await PermissionsAndroid.requestMultiple(
        permissions as Permission[]
      );

      const allGranted = Object.values(results).every(
        (result) => result === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'SMS permissions are required for rent payment reconciliation. Please grant them in app settings.'
        );
      } else {
        // Auto-start the service after permissions are granted
        try {
          await EquitySmsModule.startListening();
          console.log('[EquitySms] Service auto-started after permission grant');
        } catch (e) {
          console.error('[EquitySms] Failed to auto-start service:', e);
        }
      }

      checkStatus();
      return allGranted;
    } catch (error) {
      console.error('[EquitySms] Failed to request permissions:', error);
      setLastError('Failed to request permissions');
      return false;
    }
  }, [checkStatus]);

  const startListening = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'SMS listening is only available on Android');
      return;
    }

    try {
      // Check permissions first
      const permStatus = EquitySmsModule.checkPermissions();
      if (!permStatus.allGranted) {
        const granted = await requestPermissions();
        if (!granted) return;
      }

      const result = await EquitySmsModule.startListening();
      console.log('[EquitySms] Start listening result:', result);
      setIsListening(true);
      setLastError(null);
    } catch (error) {
      console.error('[EquitySms] Failed to start listening:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to start listening');
      throw error;
    }
  }, [requestPermissions]);

  const stopListening = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android') return;

    try {
      const result = await EquitySmsModule.stopListening();
      console.log('[EquitySms] Stop listening result:', result);
      setIsListening(false);
      setLastError(null);
    } catch (error) {
      console.error('[EquitySms] Failed to stop listening:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to stop listening');
      throw error;
    }
  }, []);

  // Use JS-side Firestore for unreconciled transactions
  const getUnreconciledTransactions = useCallback(async (): Promise<TransactionData[]> => {
    if (Platform.OS !== 'android') return [];
    try {
      return (await fetchUnreconciled()) as TransactionData[];
    } catch (error) {
      console.error('[EquitySms] Failed to get unreconciled:', error);
      return [];
    }
  }, []);

  // Use JS-side Firestore for reconciliation
  const markAsReconciled = useCallback(async (transactionId: string): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;

    try {
      // Update Firestore via JS SDK
      const success = await markTransactionReconciled(transactionId);

      // Also update local native storage
      try {
        await EquitySmsModule.markAsReconciled(transactionId);
      } catch (e) {
        // Non-critical — native side may fail, JS side is primary
        console.log('[EquitySms] Native reconcile update (non-critical):', e);
      }

      return success;
    } catch (error) {
      console.error('[EquitySms] Failed to mark as reconciled:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to update transaction');
      return false;
    }
  }, []);

  const parseSms = useCallback((smsBody: string, sender: string): TransactionData | null => {
    if (Platform.OS !== 'android') return null;

    try {
      console.log('[EquitySms] Parsing SMS (test only, no save)...');
      const result = EquitySmsModule.parseSms(smsBody, sender);
      if (result) {
        console.log('[EquitySms] Parse successful:', result.id);
      } else {
        console.log('[EquitySms] Parse failed - message format not recognized');
      }
      return result;
    } catch (error) {
      console.error('[EquitySms] Failed to parse SMS:', error);
      return null;
    }
  }, []);

  // Parse + Save: parse natively, save via JS Firestore
  const testParseAndSave = useCallback(async (smsBody: string, sender: string): Promise<TransactionData | null> => {
    if (Platform.OS !== 'android') {
      console.log('[EquitySms] testParseAndSave not available on this platform');
      return null;
    }

    try {
      console.log('[EquitySms] === TEST PARSE AND SAVE (JS Firestore) ===');
      console.log('[EquitySms] Sender:', sender);
      console.log('[EquitySms] SMS length:', smsBody.length);

      // Step 1: Parse natively (this works)
      const parsed = EquitySmsModule.parseSms(smsBody, sender);

      if (!parsed) {
        console.error('[EquitySms] ✗ Parse failed');
        return null;
      }

      console.log('[EquitySms] ✓ Parsed:', parsed.id);
      console.log('[EquitySms] Amount:', parsed.amount, parsed.currency);

      // Step 2: Save to Firestore via JS SDK (this works!)
      console.log('[EquitySms] Saving to Firestore via JS SDK...');
      const result = await saveTransactionToFirestore(parsed);

      if (result.success) {
        console.log('[EquitySms] ✓ Saved to Firestore!');
        console.log('[EquitySms] ID:', result.id);

        // Add to local state
        setTransactions((prev) => {
          const exists = prev.some(t => t.id === parsed.id);
          if (exists) return prev;
          return [parsed, ...prev];
        });

        return parsed;
      } else {
        console.error('[EquitySms] ✗ Firestore save failed:', result.error);
        setLastError(`Save failed: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error('[EquitySms] Failed to test parse and save:', error);
      setLastError(error instanceof Error ? error.message : 'Test parse and save failed');
      return null;
    }
  }, []);

  const getLocalTransactions = useCallback((): TransactionData[] => {
    if (Platform.OS !== 'android') return [];

    try {
      return EquitySmsModule.getLocalTransactions();
    } catch (error) {
      console.error('[EquitySms] Failed to get local transactions:', error);
      return [];
    }
  }, []);

  return {
    isListening,
    permissions,
    transactions,
    pendingTransactions,
    lastError,
    startListening,
    stopListening,
    requestPermissions,
    getUnreconciledTransactions,
    getLocalTransactions,
    refreshLocalTransactions,
    markAsReconciled,
    parseSms,
    testParseAndSave,
  };
}
