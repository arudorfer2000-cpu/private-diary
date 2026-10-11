import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '../crypto/diaryCrypto';

/**
 * Optional Face ID unlock.
 * The data key is kept in a keychain item that iOS only releases after Face ID (or the phone passcode).
 * Trade-off: with Face ID on, the phone's own security protects the key instead of the diary passcode.
 * Expo Go may not support this on iOS; the functions then fail quietly and the passcode keeps working.
 */
const KEY = 'diary.biokey';
const FLAG = 'diary.bioflag';

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(FLAG)) === '1';
  } catch {
    return false;
  }
}

export async function enableBiometric(dataKey: Uint8Array): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(KEY, bytesToHex(dataKey), {
      requireAuthentication: true,
      authenticationPrompt: 'Turn on Face ID for your diary',
      keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(FLAG, '1');
    return true;
  } catch {
    return false;
  }
}

/** Returns the data key after Face ID succeeded, otherwise null. */
export async function unlockWithBiometric(prompt = 'Unlock your diary'): Promise<Uint8Array | null> {
  try {
    const hex = await SecureStore.getItemAsync(KEY, {
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
    return hex ? hexToBytes(hex) : null;
  } catch {
    return null;
  }
}

export async function disableBiometric(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
    await SecureStore.deleteItemAsync(FLAG);
  } catch {
    // nothing to remove
  }
}
