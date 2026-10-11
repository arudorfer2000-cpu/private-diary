import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

const MAX_SIDE = 1600;

const removeQuietly = (uri: string) => {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // the system clears the cache folder when it needs space
  }
};

/**
 * Lets the person choose one photo from the photo library. The picture is re-encoded as a JPEG of at most
 * 1600 px, which also leaves out the camera metadata (time, place). Temporary copies are deleted.
 * Returns null when the person cancelled or did not allow access.
 */
export async function pickPhoto(): Promise<Uint8Array | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
  if (res.canceled || res.assets.length === 0) return null;
  const asset = res.assets[0];
  const temps = [asset.uri];
  try {
    let ctx = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > MAX_SIDE) ctx = asset.width >= asset.height ? ctx.resize({ width: MAX_SIDE }) : ctx.resize({ height: MAX_SIDE });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    temps.push(saved.uri);
    return new Uint8Array(await new File(saved.uri).arrayBuffer());
  } finally {
    temps.forEach(removeQuietly);
  }
}
