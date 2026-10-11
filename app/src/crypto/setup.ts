import { getRandomBytes } from 'expo-crypto';
import { configureRandom } from './diaryCrypto';

// Secure random bytes from the iOS system generator. Import this file once, before any crypto call.
configureRandom(getRandomBytes);
