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
