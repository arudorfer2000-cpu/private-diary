import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * Lets the person choose a file in the iOS Files app and returns its text, or null if they cancelled.
 * The copy in the cache folder is deleted again straight away. The file never leaves the phone.
 */
export async function pickTextFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'public.json', 'text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || res.assets.length === 0) return null;
  const file = new File(res.assets[0].uri);
  try {
    return await file.text();
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // the system clears the cache folder when it needs space
    }
  }
}
