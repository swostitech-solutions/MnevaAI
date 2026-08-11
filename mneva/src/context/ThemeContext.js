import React, { createContext, useContext, useMemo, useState } from 'react';

const defaultTheme = {
  bg: '#FAFAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#14171F',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#615FF8',
  success: '#1F9A5A',
  warning: '#F5A623',
  danger: '#E0546E',
  info: '#4FA6E8',
  soft: '#F3F4F6',
  overlay: 'rgba(20, 23, 31, 0.5)',
};

const ThemeContext = createContext({
  theme: defaultTheme,
  setTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children, initialTheme = defaultTheme }) {
  const [theme, setTheme] = useState(initialTheme);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      isDark: false,
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { defaultTheme as lightTheme };
