export const getFileExtension = (url: string, fallback: string) => {
  const match = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : fallback;
};

/** The host answered but refused the asset (404/401/…) — retrying or opening the
 * URL in a tab won't help, so callers should surface the status instead. */
export class AssetUnavailableError extends Error {
  constructor(public status: number) {
    super(`Media host returned HTTP ${status}`);
    this.name = "AssetUnavailableError";
  }
}

// Cross-origin URLs (e.g. Cloudinary) ignore the <a download> attribute and just
// navigate instead of saving, so the asset has to be fetched and saved as a blob.
export const downloadAsset = async (url: string, filename: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new AssetUnavailableError(res.status);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
};

// The Clipboard API's image write only reliably accepts "image/png" across
// browsers — Cloudinary can serve a character sheet as jpg/webp depending on
// the asset, so every fetched image is normalized through a canvas first.
const toPngBlob = (blob: Blob): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("Failed to convert image"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    img.src = objectUrl;
  });

const fetchImageAsPng = async (url: string): Promise<Blob> => {
  const res = await fetch(url);
  if (!res.ok) throw new AssetUnavailableError(res.status);
  return toPngBlob(await res.blob());
};

/** Copies one or more hosted images to the clipboard as image/png, so they can
 * be pasted directly into gemini.com alongside the manual-scene-split prompt.
 * Each ClipboardItem is built from a Promise (not an already-resolved Blob) so
 * the fetch/convert work can happen after `navigator.clipboard.write` is called
 * — that call itself must stay synchronous within the click handler's call
 * stack, or Safari/Firefox reject it for having lost user-gesture activation. */
export const copyImagesToClipboard = (urls: string[]): Promise<void> => {
  const items = urls.map((url) => new ClipboardItem({ "image/png": fetchImageAsPng(url) }));
  return navigator.clipboard.write(items);
};
