import type { Place } from '../types';

/** Rounded to 3 decimals (about 110 m): enough to remember where, too coarse to point at a door. */
export function cleanPlace(raw: unknown): Place | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { lat, lon } = raw as { lat?: unknown; lon?: unknown };
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  const r = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0
  return { lat: r(lat), lon: r(lon) };
}

/** "40.713° N, 74.006° W" */
export function formatPlace(p: Place): string {
  const f = (n: number, pos: string, neg: string) => `${Math.abs(n).toFixed(3)}° ${n >= 0 ? pos : neg}`;
  return `${f(p.lat, 'N', 'S')}, ${f(p.lon, 'E', 'W')}`;
}
