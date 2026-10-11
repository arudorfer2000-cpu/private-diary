import { cleanPlace } from './place';
import type { PlaceResult } from './getPlace';

/** BROWSER TEST HARNESS ONLY: the browser's own geolocation (the test grants or denies it). */
export function getPlace(): Promise<PlaceResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ status: 'error' });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const place = cleanPlace({ lat: p.coords.latitude, lon: p.coords.longitude });
        resolve(place ? { status: 'ok', place } : { status: 'error' });
      },
      (e) => resolve(e.code === 1 ? { status: 'denied' } : { status: 'error' }),
      { timeout: 10000 },
    );
  });
}
