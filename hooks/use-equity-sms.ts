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

interface UseEquitySmsReturn {
  /** Whether the SMS listener service is currently running */
  isListening: boolean;
  /** Current permission status */
  permissions: PermissionStatus | null;
  /** Recent transactions received via SMS */
  transactions: TransactionData[];
  /** Last error that occurred */
  lastError: string | null;
  /** Start the SMS listener service */
  startListening: () => Promise<void>;
  /** Stop the SMS listener service */
  stopListening: () => Promise<void>;
  /** Request required permissions */
  requestPermissions: () => Promise<boolean>;
  /** Get unreconciled transactions from Firestore */
  getUnreconciledTransactions: () => Promise<TransactionData[]>;
  /** Mark a transaction as reconciled */
  markAsReconciled: (transactionId: string) => Promise<boolean>;
  /** Parse an SMS message (for testing) */
  parseSms: (smsBody: string, sender: string) => TransactionData | null;
}

/**
 * Hook for managing Equity Bank SMS reconciliation.
 * Provides methods to start/stop listening, manage permissions,
 * and handle transaction data.
 */
export function useEquitySms(): UseEquitySmsReturn {
  const [isListening, setIsListening] = useState(false);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  // Check initial status
  useEffect(() => {
    if (Platform.OS === 'android') {
      checkStatus();
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscriptions = [
      EquitySmsModule.addListener('onSmsReceived', (event: SmsReceivedEvent) => {
        console.log('[EquitySms] SMS received:', event.transaction);
        setTransactions((prev) => [event.transaction, ...prev]);
      }),
      EquitySmsModule.addListener('onTransactionSaved', (event: TransactionSavedEvent) => {
        console.log('[EquitySms] Transaction saved:', event.transactionId);
      }),
      EquitySmsModule.addListener('onError', (event: ErrorEvent) => {
        console.error('[EquitySms] Error:', event.error);
        setLastError(event.error);
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

  const getUnreconciledTransactions = useCallback(async (): Promise<TransactionData[]> => {
    if (Platform.OS !== 'android') return [];

    try {
      return await EquitySmsModule.getUnreconciledTransactions();
    } catch (error) {
      console.error('[EquitySms] Failed to get unreconciled transactions:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to fetch transactions');
      return [];
    }
  }, []);

  const markAsReconciled = useCallback(async (transactionId: string): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;

    try {
      const result = await EquitySmsModule.markAsReconciled(transactionId);
      return result.success;
    } catch (error) {
      console.error('[EquitySms] Failed to mark as reconciled:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to update transaction');
      return false;
    }
  }, []);

  const parseSms = useCallback((smsBody: string, sender: string): TransactionData | null => {
    if (Platform.OS !== 'android') return null;

    try {
      return EquitySmsModule.parseSms(smsBody, sender);
    } catch (error) {
      console.error('[EquitySms] Failed to parse SMS:', error);
      return null;
    }
  }, []);

  return {
    isListening,
    permissions,
    transactions,
    lastError,
    startListening,
    stopListening,
    requestPermissions,
    getUnreconciledTransactions,
    markAsReconciled,
    parseSms,
  };
}
