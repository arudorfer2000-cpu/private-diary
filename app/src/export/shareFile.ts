import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const UTI: Record<string, string> = {
  'application/json': 'public.json',
  'text/markdown': 'net.daringfireball.markdown',
  'text/plain': 'public.plain-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'org.openxmlformats.wordprocessingml.document',
  'application/pdf': 'com.adobe.pdf',
};

const removeQuietly = (file: File) => {
  try {
    if (file.exists) file.delete();
  } catch {
    // the system also clears the cache folder when it needs space
  }
};

/**
 * Writes the export to a temporary file, opens the iOS share sheet (Save to Files, AirDrop, Mail ...),
 * and always deletes the temporary copy afterwards.
 */
export async function shareTextFile(name: string, content: string | Uint8Array, mime: string): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const file = new File(Paths.cache, name);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: UTI[mime], dialogTitle: 'Export' });
    return 'shared';
  } finally {
    removeQuietly(file);
  }
}

/** Renders the (fully escaped) HTML to a PDF on the device, shares it and deletes the temporary file. */
export async function shareHtmlAsPdf(name: string, html: string): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const made = await Print.printToFileAsync({ html });
  const file = new File(made.uri);
  try {
    const target = new File(Paths.cache, name);
    removeQuietly(target);
    file.move(target);
    await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: UTI['application/pdf'], dialogTitle: 'Export' });
    removeQuietly(target);
    return 'shared';
  } finally {
    removeQuietly(file);
  }
}
