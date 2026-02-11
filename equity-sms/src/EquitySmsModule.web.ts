import { NativeModule, registerWebModule } from 'expo';

import { EquitySmsModuleEvents, PermissionStatus, ServiceResult, TransactionData } from './EquitySms.types';

class EquitySmsModule extends NativeModule<EquitySmsModuleEvents> {
  // Web stub - SMS functionality is Android-only
  checkPermissions(): PermissionStatus {
    return { 
      sms: false, 
      readSms: false, 
      postNotifications: false, 
      bootCompleted: false, 
      foregroundService: false, 
      allGranted: false 
    };
  }

  getRequiredPermissions(): string[] {
    return ['android.permission.RECEIVE_SMS', 'android.permission.READ_SMS'];
  }

  async startListening(): Promise<ServiceResult> {
    return { success: false, message: 'SMS listening is not supported on web' };
  }

  async stopListening(): Promise<ServiceResult> {
    return { success: false, message: 'SMS listening is not supported on web' };
  }

  isListening(): boolean {
    return false;
  }

  async saveTransaction(_transaction: Partial<TransactionData>): Promise<ServiceResult> {
    return { success: false, message: 'Not supported on web' };
  }

  parseSms(_smsBody: string, _sender: string): TransactionData | null {
    return null;
  }

  async getUnreconciledTransactions(): Promise<TransactionData[]> {
    return [];
  }

  async markAsReconciled(_transactionId: string): Promise<{ success: boolean; transactionId: string }> {
    return { success: false, transactionId: _transactionId };
  }

  async getTransaction(_transactionId: string): Promise<TransactionData | null> {
    return null;
  }

  getLocalTransactions(): TransactionData[] {
    return [];
  }

  getPendingTransactions(): TransactionData[] {
    return [];
  }
}

export default registerWebModule(EquitySmsModule, 'EquitySmsModule');
