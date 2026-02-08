import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Represents a parsed Equity Bank transaction from SMS.
 */
export interface TransactionData {
  id: string;
  amount: number;
  currency: string;
  recipientName: string;
  accountReference: string;
  mpesaReference: string;
  paymentMethod: string;
  senderName: string;
  senderPhone: string;
  transactionDate: string;
  transactionTime: string;
  rawMessage: string;
  smsSender: string;
  status: 'confirmed' | 'pending' | 'failed';
  createdAt: number;
  reconciled: boolean;
  reconciledAt?: number | null;
}

/**
 * Permission status response.
 */
export interface PermissionStatus {
  sms: boolean;
  bootCompleted: boolean;
  foregroundService: boolean;
  allGranted: boolean;
}

/**
 * Service operation result.
 */
export interface ServiceResult {
  success: boolean;
  message: string;
}

/**
 * Event payload when an SMS is received and parsed.
 */
export interface SmsReceivedEvent {
  transaction: TransactionData;
}

/**
 * Event payload when a transaction is saved to Firestore.
 */
export interface TransactionSavedEvent {
  success: boolean;
  transactionId: string;
  transaction: TransactionData;
}

/**
 * Event payload for errors.
 */
export interface ErrorEvent {
  error: string;
  type: 'sms_processing_error' | 'firestore_save_failed' | 'save_failed' | 'permission_error';
  transaction?: TransactionData;
}

/**
 * Event payload for service status changes.
 */
export interface ServiceStatusEvent {
  status: 'started' | 'stopped' | 'error';
  message: string;
}

/**
 * Events emitted by the EquitySms module.
 */
export type EquitySmsModuleEvents = {
  onSmsReceived: (event: SmsReceivedEvent) => void;
  onTransactionSaved: (event: TransactionSavedEvent) => void;
  onError: (event: ErrorEvent) => void;
  onServiceStatusChanged: (event: ServiceStatusEvent) => void;
};

/**
 * Legacy types for backward compatibility.
 */
export type OnLoadEventPayload = {
  url: string;
};

export type ChangeEventPayload = {
  value: string;
};

export type EquitySmsViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
