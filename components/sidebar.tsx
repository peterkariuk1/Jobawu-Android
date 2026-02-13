/**
 * Sidebar Navigation Component
 * Professional slide-out drawer with clean navigation
 */
import { usePathname, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
    Dimensions,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { colors, shadows, spacing, typography } from '../constants/design';
import { useTheme } from '../hooks/use-theme';
import { useThemedColors } from '../hooks/use-themed-colors';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', route: '/(tabs)', icon: '📊' },
  { label: 'Register Plot', route: '/(tabs)/register-plot', icon: '🏠' },
  { label: 'Edit Plot', route: '/(tabs)/edit-plot', icon: '✏️' },
  { label: 'Tenants', route: '/(tabs)/tenants', icon: '👥' },
  { label: 'Payments', route: '/(tabs)/payments', icon: '💳' },
  { label: 'Receipts', route: '/(tabs)/receipts', icon: '🧾' },
  { label: 'Reconciliation', route: '/(tabs)/reconciliation', icon: '🔄' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.75;

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, isDark, toggleTheme } = useTheme();
  const themedColors = useThemedColors();

  const dynamicStyles = useMemo(() => StyleSheet.create({
    sidebar: {
      width: SIDEBAR_WIDTH,
      maxWidth: 320,
      backgroundColor: themedColors.background.primary,
      height: '100%',
      ...shadows.lg,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      borderRadius: 8,
      marginBottom: spacing.xs,
    },
    navItemActive: {
      backgroundColor: themedColors.primary[50],
    },
    navLabel: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.medium,
      color: themedColors.text.secondary,
    },
    navLabelActive: {
      color: themedColors.primary[600],
      fontWeight: typography.fontWeight.semibold,
    },
    footer: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.main,
    },
    version: {
      fontSize: typography.fontSize.xs,
      color: themedColors.text.tertiary,
      marginBottom: spacing.md,
    },
    themeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.base,
      backgroundColor: themedColors.background.tertiary,
      borderRadius: 8,
      marginTop: spacing.sm,
    },
    themeText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.primary,
      fontWeight: typography.fontWeight.medium,
    },
    themeIcon: {
      fontSize: 20,
    },
  }), [themedColors]);

  const handleNavigation = (route: string) => {
    onClose();
    // Small delay to allow drawer to close smoothly
    setTimeout(() => {
      router.push(route as any);
    }, 150);
  };

  if (!isOpen) return null;

  return (
    <View style={styles.overlay}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sidebar Panel */}
      <View style={dynamicStyles.sidebar}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandName}>Jobawu</Text>
          <Text style={styles.tagline}>Property Management</Text>
        </View>

        {/* Navigation */}
        <View style={styles.navContainer}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.route ||
              (item.route === '/(tabs)' && pathname === '/');

            return (
              <TouchableOpacity
                key={item.route}
                style={[dynamicStyles.navItem, isActive && dynamicStyles.navItemActive]}
                onPress={() => handleNavigation(item.route)}
                activeOpacity={0.7}
              >
                <Text style={styles.navIcon}>{item.icon}</Text>
                <Text
                  style={[dynamicStyles.navLabel, isActive && dynamicStyles.navLabelActive]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer */}
        <View style={dynamicStyles.footer}>
          <Text style={dynamicStyles.version}>Version 1.0.0</Text>
          <TouchableOpacity
            style={dynamicStyles.themeToggle}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={dynamicStyles.themeIcon}>{isDark ? '🌙' : '☀️'}</Text>
              <Text style={[dynamicStyles.themeText, { marginLeft: spacing.sm }]}>
                {isDark ? 'Dark' : 'Light'} Mode
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },

  header: {
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
    backgroundColor: colors.primary[500],
  },
  brandName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: spacing.xs,
  },
  navContainer: {
    flex: 1,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },

  navIcon: {
    fontSize: 20,
    marginRight: spacing.md,
    width: 28,
    textAlign: 'center',
  },


});
