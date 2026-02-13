/**
 * Hook for getting theme-aware colors
 * Returns colors based on current theme (light/dark)
 */
import { useTheme } from './use-theme';

export interface ThemedColors {
  // Text colors
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    placeholder: string;
    inverse: string;
  };
  // Background colors
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    card: string;
  };
  // Border colors
  border: {
    light: string;
    main: string;
    dark: string;
  };
  // Primary brand colors (same in both themes)
  primary: {
    50: string;
    500: string;
    600: string;
  };
  // Semantic colors
  success: string;
  error: string;
  warning: string;
}

const lightColors: ThemedColors = {
  text: {
    primary: '#171717',
    secondary: '#525252',
    tertiary: '#737373',
    placeholder: '#A3A3A3',
    inverse: '#FFFFFF',
  },
  background: {
    primary: '#FFFFFF',
    secondary: '#F8FAFC',
    tertiary: '#F1F5F9',
    card: '#FFFFFF',
  },
  border: {
    light: '#F5F5F5',
    main: '#E5E5E5',
    dark: '#D4D4D4',
  },
  primary: {
    50: '#E8F4FC',
    500: '#1E88C7',
    600: '#1A6FA3',
  },
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
};

const darkColors: ThemedColors = {
  text: {
    primary: '#FAFAFA',
    secondary: '#D4D4D4',
    tertiary: '#A3A3A3',
    placeholder: '#737373',
    inverse: '#171717',
  },
  background: {
    primary: '#171717',
    secondary: '#262626',
    tertiary: '#404040',
    card: '#262626',
  },
  border: {
    light: '#404040',
    main: '#525252',
    dark: '#737373',
  },
  primary: {
    50: '#103D5B',
    500: '#50A4E8',
    600: '#77B9ED',
  },
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
};

/**
 * Returns colors appropriate for the current theme
 */
export function useThemedColors(): ThemedColors {
  const { isDark } = useTheme();
  return isDark ? darkColors : lightColors;
}
