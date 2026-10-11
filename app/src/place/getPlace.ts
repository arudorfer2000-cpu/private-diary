import * as Location from 'expo-location';
import { cleanPlace } from './place';
import type { Place } from '../types';

export type PlaceResult = { status: 'ok'; place: Place } | { status: 'denied' } | { status: 'error' };

/** One position fix, only when the person asks, only while the app is open. Coordinates are rounded; nothing is sent anywhere. */
export async function getPlace(): Promise<PlaceResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { status: 'denied' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const place = cleanPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    return place ? { status: 'ok', place } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
