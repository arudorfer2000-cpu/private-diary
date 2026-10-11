const MAX_SIDE = 1600;

/** Draws the picture at most 1600 px on its longer side and returns it as a JPEG (the camera metadata is not carried over). */
async function shrink(file: File): Promise<Uint8Array> {
  const raw = new Uint8Array(await file.arrayBuffer());
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.7));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : raw;
  } catch {
    return raw; // not a picture the browser can read: the caller's check refuses it
  }
}

/** WEB APP: a plain file chooser (on an iPhone it offers the photo library and the camera). */
export function pickPhoto(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? await shrink(f) : null);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
