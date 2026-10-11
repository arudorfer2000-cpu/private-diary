import type { KeyValueStore } from './store';
import { idbGet, idbRemove, idbSet } from '../web/idb';

/**
 * WEB APP. Browsers have no keychain, so the key bundle lives in IndexedDB. It is not plain:
 * the data key inside is wrapped with a key derived from the passcode (Argon2id), exactly as on the phone.
 * What the keychain adds on iOS (protection when the phone is locked, Face ID) is not available here,
 * so the strength of the passcode is the whole protection. The app says so in Settings.
 */
export const secureStore: KeyValueStore = {
  get: async (key) => (await idbGet<string>('key:' + key)) ?? null,
  set: async (key, value) => idbSet('key:' + key, value),
  remove: async (key) => idbRemove('key:' + key),
};
