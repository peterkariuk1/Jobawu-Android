/**
 * Professional Design System for Jobawu
 * Clean, minimal design with excellent typography and spacing
 */

export const DesignTokens = {
  // Color Palette - Professional & Trust-inspiring
  colors: {
    // Primary - Deep blue for trust and professionalism
    primary: {
      50: '#E8F4FC',
      100: '#C5E3F7',
      200: '#9ECEF2',
      300: '#77B9ED',
      400: '#50A4E8',
      500: '#1E88C7', // Main primary
      600: '#1A6FA3',
      700: '#15567F',
      800: '#103D5B',
      900: '#0B2437',
    },
    // Neutral - For text and backgrounds
    neutral: {
      50: '#FAFAFA',
      100: '#F5F5F5',
      200: '#E5E5E5',
      300: '#D4D4D4',
      400: '#A3A3A3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
    },
    // Semantic colors
    success: {
      light: '#ECFDF5',
      main: '#10B981',
      dark: '#047857',
    },
    warning: {
      light: '#FFFBEB',
      main: '#F59E0B',
      dark: '#B45309',
    },
    error: {
      light: '#FEF2F2',
      main: '#EF4444',
      dark: '#B91C1C',
    },
    // Background
    background: {
      primary: '#FFFFFF',
      secondary: '#F8FAFC',
      tertiary: '#F1F5F9',
    },
  },

  // Typography Scale - Clear hierarchy
  typography: {
    fontFamily: {
      heading: 'System',
      body: 'System',
      mono: 'Menlo',
    },
    fontSize: {
      xs: 11,
      sm: 13,
      base: 15,
      md: 17,
      lg: 20,
      xl: 24,
      '2xl': 30,
      '3xl': 36,
      '4xl': 48,
    },
    fontWeight: {
      normal: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // Spacing Scale - Consistent rhythm
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
    '5xl': 64,
  },

  // Border Radius
  borderRadius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  // Shadows - Subtle depth
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
  },
};

// Convenience exports
export const { colors, typography, spacing, borderRadius, shadows } = DesignTokens;
