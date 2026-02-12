import type { TransactionData } from 'equity-sms';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, PermissionsAndroid, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sidebar } from '../../components/sidebar';
import { colors, spacing, typography } from '../../constants/design';
import { useEquitySms } from '../../hooks/use-equity-sms';

/**
 * SMS Reconciliation Screen
 * 
 * Features:
 * - Real-time SMS monitoring for Equity Bank transactions
 * - Automatic Firebase sync on SMS receipt
 * - Display recent transactions
 */
export default function ReconciliationScreen() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(true);
  const {
    isListening,
    permissions,
    transactions,
    pendingTransactions,
    isSyncing,
    lastSyncAt,
    lastSyncError,
    lastError,
    startListening,
    stopListening,
    requestPermissions,
    refreshLocalTransactions,
    syncPendingNow,
  } = useEquitySms();

  const [refreshing, setRefreshing] = React.useState(false);
  const [permissionsChecked, setPermissionsChecked] = React.useState(false);

  // Check actual Android system permissions and auto-request if needed
  useEffect(() => {
    if (Platform.OS !== 'android' || permissionsChecked) return;

    const checkAndRequestPermissions = async () => {
      try {
        // Check if READ_SMS, RECEIVE_SMS, and POST_NOTIFICATIONS permissions are granted
        const readSmsGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_SMS
        );
        const receiveSmsGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
        );
        const postNotificationsGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

        console.log('[Reconciliation] Permission status:', {
          readSms: readSmsGranted,
          receiveSms: receiveSmsGranted,
          postNotifications: postNotificationsGranted,
        });

        if (readSmsGranted && receiveSmsGranted && postNotificationsGranted) {
          // All required permissions already granted - auto-start without any prompts
          console.log('[Reconciliation] All permissions already granted, auto-starting...');
          if (!isListening) {
            try {
              await startListening();
              console.log('[Reconciliation] Successfully started listening');
            } catch (error) {
              console.error('[Reconciliation] Failed to auto-start listening:', error);
            }
          }
        } else {
          // Some permissions not granted yet - request them all
          console.log('[Reconciliation] Some permissions not granted, requesting...');
          await requestPermissions();
        }
      } catch (error) {
        console.error('[Reconciliation] Error checking permissions:', error);
      } finally {
        setPermissionsChecked(true);
      }
    };

    checkAndRequestPermissions();
  }, [permissionsChecked, isListening, startListening, requestPermissions]);

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

  const handleManualSync = async () => {
    try {
      await syncPendingNow();
    } catch (error) {
      Alert.alert('Sync Error', error instanceof Error ? error.message : 'Failed to sync pending transactions');
    }
  };

  const syncStatusText = isSyncing
    ? 'Syncing now...'
    : pendingTransactions.length > 0
    ? `Queued (${pendingTransactions.length}) — will sync when online`
    : 'All synced';

  const lastSyncText = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString()
    : 'Never';

  const renderTransaction = ({ item }: { item: TransactionData }) => (
    <View className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-lg font-bold text-green-600">
          KES {item.amount.toLocaleString()}
        </Text>
        <Text className="text-gray-600 text-xs font-medium">
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      
      <Text className="text-gray-700 font-medium">{item.recipientName}</Text>
      <Text className="text-gray-500 text-sm">From: {item.senderName}</Text>
      <Text className="text-gray-500 text-sm">Phone: {item.senderPhone}</Text>
      <Text className="text-gray-400 text-xs mt-1">
        {item.transactionDate} at {item.transactionTime}
      </Text>
      <Text className="text-gray-400 text-xs">Ref: {item.mpesaReference}</Text>
    </View>
  );

  if (Platform.OS !== 'android') {
    return (
      <SafeAreaView style={headerStyles.container} edges={['top']}>
        <View style={headerStyles.header}>
          <TouchableOpacity
            style={headerStyles.menuButton}
            onPress={() => setSidebarOpen(true)}
            activeOpacity={0.7}
          >
            <View style={headerStyles.menuIcon}>
              <View style={headerStyles.menuLine} />
              <View style={headerStyles.menuLine} />
              <View style={headerStyles.menuLine} />
            </View>
          </TouchableOpacity>
          <Text style={headerStyles.headerTitle}>Reconciliation</Text>
          <View style={headerStyles.headerSpacer} />
        </View>
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-gray-500 text-center">
            SMS reconciliation is only available on Android devices.
          </Text>
        </View>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={headerStyles.container} edges={['top']}>
      {/* Header with Menu */}
      <View style={headerStyles.header}>
        <TouchableOpacity
          style={headerStyles.menuButton}
          onPress={() => setSidebarOpen(true)}
          activeOpacity={0.7}
        >
          <View style={headerStyles.menuIcon}>
            <View style={headerStyles.menuLine} />
            <View style={headerStyles.menuLine} />
            <View style={headerStyles.menuLine} />
          </View>
        </TouchableOpacity>
        <Text style={headerStyles.headerTitle}>Reconciliation</Text>
        <View className="flex-row items-center">
          <View className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500' : 'bg-gray-400'}`} />
          <Text className="ml-2 text-sm text-gray-600">
            {isListening ? 'Active' : 'Off'}
          </Text>
        </View>
      </View>

      <View className="flex-1 bg-gray-50">
        
        {/* DEBUG PANEL - Tap to collapse */}
        <TouchableOpacity 
          onPress={() => setDebugExpanded(!debugExpanded)}
          className="bg-blue-900 p-3 mb-2"
        >
          <Text className="text-white font-bold">
            🐛 DEBUG INFO {debugExpanded ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>
        
        {debugExpanded && (
          <View className="bg-blue-50 p-3 mb-2 border border-blue-200">
            <Text className="text-blue-900 font-bold mb-2">Service Status:</Text>
            <Text className="text-sm mb-1">• Listening: {isListening ? '✅ YES' : '❌ NO'}</Text>
            <Text className="text-sm mb-1">• SMS Permission: {permissions?.sms ? '✅' : '❌'}</Text>
            <Text className="text-sm mb-1">• SMS Read: {permissions?.readSms ? '✅' : '❌'}</Text>
            <Text className="text-sm mb-1">• Post Notifications: {permissions?.postNotifications ? '✅' : '❌'}</Text>
            <Text className="text-sm mb-1">• Boot Permission: {permissions?.bootCompleted ? '✅' : '❌'}</Text>
            
            <Text className="text-blue-900 font-bold mt-3 mb-2">Transactions:</Text>
            <Text className="text-sm mb-1">• Local Stored: {transactions.length}</Text>
            <Text className="text-sm mb-1">• Pending Sync: {pendingTransactions.length}</Text>
            
            {lastError && (
              <>
                <Text className="text-red-600 font-bold mt-3 mb-2">Last Error:</Text>
                <Text className="text-sm text-red-600">{lastError}</Text>
              </>
            )}
            
            <Text className="text-blue-900 font-bold mt-3 mb-2">Instructions:</Text>
            <Text className="text-xs text-blue-800">
              1. Make sure all permissions are ✅{'\n'}
              2. Service should show "Listening: YES"{'\n'}
              3. Send an SMS from Equity Bank to your phone{'\n'}
              4. Watch this screen - transactions appear automatically and sync to Firebase
            </Text>
          </View>
        )}

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
        {isListening && (
          <View className="flex-row space-x-2 mb-2">
            <TouchableOpacity
              onPress={handleToggleListening}
              className="flex-1 rounded-md py-3 bg-red-500"
            >
              <Text className="text-white text-center font-medium">
                Stop Listening
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Transactions List */}
      <View className="flex-1 p-4">
        {/* Queue Sync Status */}
        <View className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-100">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-gray-700">Queue Sync Status</Text>
            <View className={`px-2 py-1 rounded ${isSyncing ? 'bg-blue-100' : pendingTransactions.length > 0 ? 'bg-yellow-100' : 'bg-green-100'}`}>
              <Text className={`text-xs font-medium ${isSyncing ? 'text-blue-700' : pendingTransactions.length > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                {isSyncing ? 'Syncing' : pendingTransactions.length > 0 ? 'Queued' : 'Synced'}
              </Text>
            </View>
          </View>
          <Text className="text-xs text-gray-600">{syncStatusText}</Text>
          <Text className="text-xs text-gray-500 mt-1">Last sync: {lastSyncText}</Text>

          {lastSyncError && (
            <Text className="text-xs text-red-600 mt-2">Last sync error: {lastSyncError}</Text>
          )}

          <TouchableOpacity
            onPress={handleManualSync}
            disabled={isSyncing}
            className={`mt-3 rounded-md py-2 ${isSyncing ? 'bg-gray-300' : 'bg-blue-500'}`}
          >
            <Text className="text-white text-center text-sm font-medium">
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-lg font-semibold text-gray-700 mb-3">
          Recent Transactions ({transactions.length})
        </Text>
        
        {transactions.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-400 text-center">
              No transactions yet.{'\n'}
              Transactions will appear here when they're received from Equity Bank.
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

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  menuButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  menuIcon: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  menuLine: {
    width: 24,
    height: 2,
    backgroundColor: colors.neutral[700],
    borderRadius: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },
});
