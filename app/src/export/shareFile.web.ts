/** WEB APP: "sharing" is a file download (the browser puts it in the Downloads folder). */
export async function shareTextFile(name: string, content: string | Uint8Array, mime: string): Promise<'shared' | 'unavailable'> {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'shared';
}

/** WEB APP: the entries open in the browser's print dialog; choose "Save as PDF" there. */
export async function shareHtmlAsPdf(_name: string, html: string): Promise<'shared' | 'unavailable'> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) {
        frame.remove();
        return resolve('unavailable');
      }
      w.onafterprint = () => setTimeout(() => frame.remove(), 500);
      w.focus();
      w.print();
      resolve('shared');
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
