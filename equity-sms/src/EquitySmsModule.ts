import { NativeModule, requireNativeModule } from 'expo';

import {
  EquitySmsModuleEvents,
  PermissionStatus,
  ServiceResult,
  TransactionData,
} from './EquitySms.types';

/**
 * EquitySms Native Module Interface
 * 
 * Provides methods for SMS listening, parsing, and Firestore integration
 * for Equity Bank rent payment reconciliation.
 */
declare class EquitySmsModule extends NativeModule<EquitySmsModuleEvents> {
  /**
   * Starts the background SMS listener service.
   * Requires SMS permissions to be granted.
   * @returns Promise with service start result
   */
  startListening(): Promise<ServiceResult>;

  /**
   * Stops the background SMS listener service.
   * @returns Promise with service stop result
   */
  stopListening(): Promise<ServiceResult>;

  /**
   * Checks if the SMS listener service is currently running.
   * @returns boolean indicating if service is active
   */
  isListening(): boolean;

  /**
   * Checks the current status of required permissions.
   * @returns PermissionStatus object with permission states
   */
  checkPermissions(): PermissionStatus;

  /**
   * Gets the list of required Android permissions.
   * @returns Array of permission strings
   */
  getRequiredPermissions(): string[];

  /**
   * Manually saves a transaction to Firestore.
   * Useful for testing or manual data entry.
   * @param transaction - Transaction data to save
   * @returns Promise with save result
   */
  saveTransaction(transaction: Partial<TransactionData>): Promise<ServiceResult>;

  /**
   * Parses an SMS message body to extract transaction data.
   * Useful for testing the parser without actual SMS.
   * @param smsBody - The SMS message body
   * @param sender - The SMS sender address
   * @returns Parsed TransactionData or null if parsing fails
   */
  parseSms(smsBody: string, sender: string): TransactionData | null;

  /**
   * Retrieves all unreconciled transactions from Firestore.
   * @returns Promise with array of unreconciled transactions
   */
  getUnreconciledTransactions(): Promise<TransactionData[]>;

  /**
   * Marks a transaction as reconciled in Firestore.
   * @param transactionId - The ID of the transaction to mark
   * @returns Promise with update result
   */
  markAsReconciled(transactionId: string): Promise<{ success: boolean; transactionId: string }>;

  /**
   * Retrieves a specific transaction by ID from Firestore.
   * @param transactionId - The ID of the transaction to fetch
   * @returns Promise with the transaction data or null
   */
  getTransaction(transactionId: string): Promise<TransactionData | null>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<EquitySmsModule>('EquitySms');
