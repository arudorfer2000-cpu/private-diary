import * as SecureStore from 'expo-secure-store';
import type { KeyValueStore } from './store';

// iOS keychain. "This device only": never copied to iCloud or to a backup on another device.
const OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureStore: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key, OPTS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTS),
  remove: (key) => SecureStore.deleteItemAsync(key, OPTS),
};
