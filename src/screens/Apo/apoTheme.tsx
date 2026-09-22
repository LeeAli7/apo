// Apo — локальная тёмная тема экранов.
// NATIVE OWNER (Ares): при появлении общего ThemeProvider в scaffold
// заменить useApoTheme() на общий useTheme() — интерфейс { theme } совпадает.
import React, { createContext, useContext } from 'react';

export interface ApoTheme {
  bg: string;
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  border: string;
  divider: string;
}

const apoTheme: ApoTheme = {
  bg: '#0B0F17',
  surface: '#131A26',
  text: '#F2F5F9',
  textSecondary: '#8A94A6',
  accent: '#4F7CFF',
  border: '#232D40',
  divider: '#161D2A',
};

const Ctx = createContext<{ theme: ApoTheme }>({ theme: apoTheme });

export function ApoThemeProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ theme: apoTheme }}>{children}</Ctx.Provider>;
}

// Совместим с useTheme() из md-reader: экраны берут только { theme }.
export function useTheme() {
  return useContext(Ctx);
}
