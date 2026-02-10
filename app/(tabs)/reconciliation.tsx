import type { TransactionData } from 'equity-sms';
import React, { useEffect } from 'react';
import { Alert, FlatList, Platform, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useEquitySms } from '../../hooks/use-equity-sms';

/**
 * SMS Reconciliation Screen
 * 
 * Features:
 * - Real-time SMS monitoring for Equity Bank transactions
 * - Offline-first with automatic Firestore sync
 * - Test parse (no save) and test parse+save buttons
 * - Transaction reconciliation workflow
 */
export default function ReconciliationScreen() {
  const {
    isListening,
    permissions,
    transactions,
    pendingTransactions,
    lastError,
    startListening,
    stopListening,
    requestPermissions,
    refreshLocalTransactions,
    markAsReconciled,
    parseSms,
    testParseAndSave,
  } = useEquitySms();

  const [refreshing, setRefreshing] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);

  // Request permissions on mount
  useEffect(() => {
    if (Platform.OS === 'android' && permissions && !permissions.allGranted) {
      console.log('[Reconciliation] Requesting permissions...');
      requestPermissions();
    }
  }, [permissions, requestPermissions]);

  // Auto-start listening when permissions are granted
  useEffect(() => {
    if (Platform.OS === 'android' && permissions?.allGranted && !isListening) {
      console.log('[Reconciliation] Permissions granted, starting listener...');
      startListening().catch(err => {
        console.error('[Reconciliation] Failed to auto-start:', err);
      });
    }
  }, [permissions?.allGranted, isListening, startListening]);

  const handleRefresh = async () => {
    setRefreshing(true);
    refreshLocalTransactions();
    setRefreshing(false);
  };

  const handleToggleListening = async () => {
    try {
      if (isListening) {
        await stopListening();
      } else {
        await startListening();
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // Test SMS message - matches Equity Bank format
  const TEST_SMS = `Confirmed KES. 7,940.00 to GRACEWANGECHIMUREITHI A/C Ref.Number 11111 Via MPESA Ref UAGH013ERL6 by Dennis Ngumbi Agnes Phone 25479354525 on 10-01-2026 at 10:39.Thank you.`;
  const TEST_SENDER = 'pjeykrs2';

  const handleTestParseOnly = () => {
    console.log('[Reconciliation] ====== TEST PARSE ONLY ======');
    console.log('[Reconciliation] This only parses, does NOT save to Firebase');
    
    const result = parseSms(TEST_SMS, TEST_SENDER);
    
    if (result) {
      console.log('[Reconciliation] ✓ Parse successful:', result);
      Alert.alert(
        '✓ Parse Successful (Not Saved)',
        `Amount: KES ${result.amount.toLocaleString()}\n` +
        `Recipient: ${result.recipientName}\n` +
        `Sender: ${result.senderName}\n` +
        `Phone: ${result.senderPhone}\n` +
        `MPESA Ref: ${result.mpesaReference}\n` +
        `Date: ${result.transactionDate} ${result.transactionTime}\n\n` +
        `Note: This was just a parse test. Use "Test & Save" to save to Firebase.`
      );
    } else {
      console.log('[Reconciliation] ✗ Parse failed');
      Alert.alert('✗ Parse Failed', 'Could not parse the SMS message. Check Logcat for details.');
    }
  };

  const handleTestParseAndSave = async () => {
    console.log('[Reconciliation] ====== TEST PARSE AND SAVE ======');
    console.log('[Reconciliation] This parses AND saves to Firebase');
    
    setIsTesting(true);
    
    try {
      const result = await testParseAndSave(TEST_SMS, TEST_SENDER);
      
      if (result) {
        console.log('[Reconciliation] ✓ Parse and save successful!');
        Alert.alert(
          '✓ Saved to Firebase!',
          `Transaction saved successfully!\n\n` +
          `ID: ${result.id}\n` +
          `Amount: KES ${result.amount.toLocaleString()}\n` +
          `MPESA Ref: ${result.mpesaReference}\n\n` +
          `Check Logcat for detailed logs.`
        );
      } else {
        console.log('[Reconciliation] ✗ Parse and save failed');
        Alert.alert('✗ Save Failed', 'Parse succeeded but save failed. Check Logcat for details.');
      }
    } catch (error) {
      console.error('[Reconciliation] Test error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsTesting(false);
    }
  };

  const handleReconcile = async (transactionId: string) => {
    const success = await markAsReconciled(transactionId);
    if (success) {
      Alert.alert('✓ Success', 'Transaction marked as reconciled');
      refreshLocalTransactions();
    } else {
      Alert.alert('✗ Error', 'Failed to reconcile transaction. Check logs for details.');
    }
  };

  const renderTransaction = ({ item }: { item: TransactionData }) => (
    <View className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-lg font-bold text-green-600">
          KES {item.amount.toLocaleString()}
        </Text>
        <View className={`px-2 py-1 rounded ${item.reconciled ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Text className={`text-xs font-medium ${item.reconciled ? 'text-green-700' : 'text-yellow-700'}`}>
            {item.reconciled ? 'Reconciled' : 'Pending'}
          </Text>
        </View>
      </View>
      
      <Text className="text-gray-700 font-medium">{item.recipientName}</Text>
      <Text className="text-gray-500 text-sm">From: {item.senderName}</Text>
      <Text className="text-gray-500 text-sm">Phone: {item.senderPhone}</Text>
      <Text className="text-gray-400 text-xs mt-1">
        {item.transactionDate} at {item.transactionTime}
      </Text>
      <Text className="text-gray-400 text-xs">Ref: {item.mpesaReference}</Text>
      
      {!item.reconciled && (
        <TouchableOpacity
          onPress={() => handleReconcile(item.id)}
          className="mt-3 bg-blue-500 rounded-md py-2 px-4"
        >
          <Text className="text-white text-center font-medium">Mark as Reconciled</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (Platform.OS !== 'android') {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-gray-500 text-center">
          SMS reconciliation is only available on Android devices.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header Status */}
      <View className="bg-white p-4 border-b border-gray-200">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-xl font-bold text-gray-800">SMS Reconciliation</Text>
          <View className="flex-row items-center">
            <View className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500' : 'bg-gray-400'}`} />
            <Text className="ml-2 text-sm text-gray-600">
              {isListening ? 'Listening' : 'Stopped'}
            </Text>
          </View>
        </View>
        
        {/* Permission Status */}
        <View className="flex-row items-center mb-2">
          <Text className="text-gray-600 mr-2">SMS Permission:</Text>
          <Text className={`font-medium ${permissions?.sms ? 'text-green-600' : 'text-red-600'}`}>
            {permissions?.sms ? 'Granted' : 'Not Granted'}
          </Text>
        </View>

        {/* Pending Sync Status */}
        {pendingTransactions.length > 0 && (
          <View className="bg-yellow-50 p-2 rounded-md mb-2">
            <Text className="text-yellow-700 text-sm">
              {pendingTransactions.length} transaction(s) pending Firestore sync
            </Text>
          </View>
        )}

        {/* Error Display */}
        {lastError && (
          <View className="bg-red-50 p-2 rounded-md mb-3">
            <Text className="text-red-600 text-sm">{lastError}</Text>
          </View>
        )}

        {/* Control Buttons */}
        <View className="flex-row space-x-2 mb-2">
          <TouchableOpacity
            onPress={handleToggleListening}
            className={`flex-1 rounded-md py-3 ${isListening ? 'bg-red-500' : 'bg-green-500'}`}
          >
            <Text className="text-white text-center font-medium">
              {isListening ? 'Stop Listening' : 'Start Listening'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Test Buttons Row */}
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={handleTestParseOnly}
            className="flex-1 bg-gray-500 rounded-md py-3"
          >
            <Text className="text-white text-center font-medium text-sm">Test Parse</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleTestParseAndSave}
            disabled={isTesting}
            className={`flex-1 rounded-md py-3 ${isTesting ? 'bg-blue-300' : 'bg-blue-500'}`}
          >
            <Text className="text-white text-center font-medium text-sm">
              {isTesting ? 'Saving...' : 'Test & Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transactions List */}
      <View className="flex-1 p-4">
        <Text className="text-lg font-semibold text-gray-700 mb-3">
          Recent Transactions ({transactions.length})
        </Text>
        
        {transactions.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-400 text-center">
              No transactions yet.{'\n'}
              Send a test SMS from 'pjeykrs2' or Equity Bank.{'\n\n'}
              Check Logcat for debugging:{'\n'}
              adb logcat -s EquitySmsReceiver EquitySmsParser SmsListenerService
            </Text>
          </View>
        ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
          />
        )}
      </View>
    </View>
  );
}
