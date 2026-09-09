import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'mneva_dark_mode';

// Structural tokens only (background/surface/text/border). Brand and status
// colors (green/purple/red/amber/blue accents, category color palettes) are
// deliberately left as their existing hardcoded values across screens —
// they're saturated enough to read fine on both backgrounds, and remapping
// every one of them would be a much larger, lower-value effort than getting
// the backgrounds/surfaces/text/borders right first.
export const lightTheme = {
  isDark: false,
  bg: '#F9FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F6F8',
  soft: '#F3F4F6',
  card: '#FFFFFF',
  border: '#F0F1F4',
  borderStrong: '#E3E5EA',
  text: '#14171F',
  textSecondary: '#374151',
  muted: '#6B7280',
  faint: '#9AA1AE',
  disabled: '#C7CBD3',
  placeholder: '#9CA3AF',
  accent: '#1F9A5A',
  accentAlt: '#615FF8',
  success: '#1F9A5A',
  warning: '#F5A623',
  danger: '#E0546E',
  info: '#4FA6E8',
  overlay: 'rgba(20, 23, 31, 0.5)',
  statusBarStyle: 'dark',
  tabBarBg: '#FFFFFF',
};

export const darkTheme = {
  isDark: true,
  bg: '#0C0E13',
  surface: '#161922',
  surfaceAlt: '#1D212B',
  soft: '#232733',
  card: '#161922',
  border: '#262B36',
  borderStrong: '#333947',
  text: '#F2F3F5',
  textSecondary: '#D1D5DB',
  muted: '#9CA3AF',
  faint: '#7B8494',
  disabled: '#4B5563',
  placeholder: '#6B7280',
  accent: '#34C77B',
  accentAlt: '#8180FF',
  success: '#34C77B',
  warning: '#FFB84D',
  danger: '#F17186',
  info: '#6BB8F0',
  overlay: 'rgba(0, 0, 0, 0.65)',
  statusBarStyle: 'light',
  tabBarBg: '#161922',
};

const ThemeContext = createContext({
  theme: lightTheme,
  isDark: false,
  ready: false,
  toggleTheme: () => {},
  setDarkMode: () => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  // Load the user's saved choice once on app start. Defaults to light (the
  // app's original look) until this resolves, so there's no dark-flash on
  // a device that has never opted in.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => { if (!cancelled && v === 'true') setIsDark(true); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  const setDarkMode = useCallback((val) => {
    setIsDark(val);
    AsyncStorage.setItem(THEME_KEY, val ? 'true' : 'false').catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'true' : 'false').catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      ready,
      toggleTheme,
      setDarkMode,
    }),
    [isDark, ready, toggleTheme, setDarkMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
