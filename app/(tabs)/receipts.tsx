/**
 * Receipts Page - Placeholder
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/page-header';
import { Sidebar } from '../../components/sidebar';
import { typography } from '../../constants/design';
import { useThemedColors } from '../../hooks/use-themed-colors';

export default function Receipts() {
  const themedColors = useThemedColors();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
    },
    placeholder: {
      fontSize: typography.fontSize.md,
      color: themedColors.text.secondary,
    },
  }), [themedColors]);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <PageHeader 
        title="Receipts" 
        onMenuPress={() => setSidebarOpen(true)} 
      />

      <View style={styles.content}>
        <Text style={dynamicStyles.placeholder}>Receipts - Coming Soon</Text>
      </View>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
