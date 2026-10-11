import type { ThemeChoice } from './settings/settings';

export type Palette = {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentText: string;
  outline: string;
  voiceBg: string;
  voiceCard: string;
  voiceBorder: string;
  voiceText: string;
  voiceDim: string;
  stop: string;
  /** Text colour for body copy inside cards. */
  cardBody: string;
  /** Used for the "on" ring around selected mood dots. */
  ring: string;
  statusBar: 'light' | 'dark';
};

const voice = {
  voiceBg: '#120F22',
  voiceCard: '#1E1A38',
  voiceBorder: '#4A4380',
  voiceText: '#F1EEFA',
  voiceDim: '#B3AED3',
};

export const darkPalette: Palette = {
  bg: '#0A1214',
  card: '#142326',
  cardBorder: '#214046',
  text: '#DDEBEC',
  textDim: '#A7BCBE',
  textFaint: '#8FA6A8',
  accent: '#7FD1D4',
  accentText: '#06191B',
  outline: '#3B6A70',
  stop: '#FF7A6B',
  cardBody: '#C3D3D4',
  ring: '#DDEBEC',
  statusBar: 'light',
  ...voice,
};

export const lightPalette: Palette = {
  bg: '#F6F4EE',
  card: '#FFFFFF',
  cardBorder: '#D9D4C7',
  text: '#16282B',
  textDim: '#40565A',
  textFaint: '#566B6E',
  accent: '#1B6F75',
  accentText: '#FFFFFF',
  outline: '#5A8A8F',
  stop: '#B3261E',
  cardBody: '#2B4144',
  ring: '#16282B',
  statusBar: 'dark',
  ...voice,
};

export function resolvePalette(choice: ThemeChoice, system: 'light' | 'dark' | null | undefined): Palette {
  if (choice === 'light') return lightPalette;
  if (choice === 'dark') return darkPalette;
  return system === 'light' ? lightPalette : darkPalette;
}

// ---- contrast (WCAG): used by the tests and handy when picking colours ----

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
