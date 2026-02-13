/**
 * Reusable Page Header Component with Theme Support
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { spacing, typography } from '../constants/design';
import { useThemedColors } from '../hooks/use-themed-colors';

interface PageHeaderProps {
  title: string;
  onMenuPress: () => void;
  rightComponent?: React.ReactNode;
}

export function PageHeader({ title, onMenuPress, rightComponent }: PageHeaderProps) {
  const themedColors = useThemedColors();

  const dynamicStyles = useMemo(() => StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      backgroundColor: themedColors.background.primary,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
    },
    headerTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: themedColors.text.primary,
      letterSpacing: -0.3,
    },
    menuLine: {
      width: 24,
      height: 2,
      backgroundColor: themedColors.text.primary,
      borderRadius: 1,
    },
  }), [themedColors]);

  return (
    <View style={dynamicStyles.header}>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={onMenuPress}
        activeOpacity={0.7}
      >
        <View style={styles.menuIcon}>
          <View style={dynamicStyles.menuLine} />
          <View style={dynamicStyles.menuLine} />
          <View style={dynamicStyles.menuLine} />
        </View>
      </TouchableOpacity>
      <Text style={dynamicStyles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer}>
        {rightComponent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  menuIcon: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  headerSpacer: {
    width: 40,
    alignItems: 'flex-end',
  },
});
