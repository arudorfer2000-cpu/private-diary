import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkPalette, resolvePalette, type Palette } from './palettes';
import type { ThemeChoice } from './settings/settings';

const ThemeContext = createContext<Palette>(darkPalette);

/** Gives every screen the palette for the chosen theme; "system" follows the phone's light/dark setting. */
export function ThemeProvider({ choice, children }: { choice: ThemeChoice; children: ReactNode }) {
  const system = useColorScheme();
  return <ThemeContext.Provider value={resolvePalette(choice, system === 'light' || system === 'dark' ? system : null)}>{children}</ThemeContext.Provider>;
}

export function useTheme(): { colors: Palette } {
  return { colors: useContext(ThemeContext) };
}
