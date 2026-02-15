import { Tabs } from 'expo-router';
import React from 'react';

/**
 * Tab layout - Hidden tab bar since we use sidebar navigation
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Hide tab bar - we use sidebar
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="register-plot" options={{ title: 'Register Plot' }} />
      <Tabs.Screen name="edit-plot" options={{ title: 'Edit Plot' }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments' }} />
      <Tabs.Screen name="payment-detail" options={{ title: 'Payment Detail', href: null }} />
      <Tabs.Screen name="receipts" options={{ title: 'Receipts' }} />
      <Tabs.Screen name="receipt-detail" options={{ title: 'Receipt Detail', href: null }} />
      <Tabs.Screen name="reconciliation" options={{ title: 'Reconciliation' }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
