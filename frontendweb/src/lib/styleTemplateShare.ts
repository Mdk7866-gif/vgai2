import type { SceneDensity, StyleTemplate } from "@/types/styletemplate";

/** The portable JSON shape a style template is exported/shared as, and the
 * shape `styleTemplateImport.ts` parses back on the receiving end. Mirrors
 * `DefaultStyleTemplate` (the starter-catalog entry shape) rather than the
 * full `StyleTemplate` row — no `id`/`user_id`/`is_default`/timestamps, since
 * none of that is meaningful once the file leaves this account. `slug` is
 * derived from the name purely for a readable filename/display; it's ignored
 * on import, never round-tripped into anything stored. */
export interface StyleTemplateShareData {
  slug: string;
  name: string;
  image_prompt: string;
  animation_prompt: string;
  description: string;
  youtube_title_description_tags_prompt: string | null;
  youtube_thumbnail_image_prompt: string | null;
  scene_density: SceneDensity;
  image_aspect_ratio: string;
  video_aspect_ratio: string;
  best_for: string | null;
  demo_image_url: string | null;
}

const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "style-template";

export const buildShareableStyleTemplate = (template: StyleTemplate): StyleTemplateShareData => ({
  slug: slugify(template.name),
  name: template.name,
  image_prompt: template.image_prompt,
  animation_prompt: template.animation_prompt,
  description: template.description,
  youtube_title_description_tags_prompt: template.youtube_title_description_tags_prompt,
  youtube_thumbnail_image_prompt: template.youtube_thumbnail_image_prompt,
  scene_density: template.scene_density,
  image_aspect_ratio: template.image_aspect_ratio,
  video_aspect_ratio: template.video_aspect_ratio,
  best_for: template.best_for,
  demo_image_url: template.demo_image_url,
});

const jsonFileName = (template: StyleTemplate) => `${slugify(template.name)}.vgai2-style.json`;
const textFileName = (template: StyleTemplate) => `${slugify(template.name)}.vgai2-style.txt`;

const buildJson = (template: StyleTemplate): string => JSON.stringify(buildShareableStyleTemplate(template), null, 2);

export const downloadStyleTemplateJson = (template: StyleTemplate): void => {
  const blob = new Blob([buildJson(template)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = jsonFileName(template);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

type ShareCapableNavigator = Navigator & {
  canShare?: (data?: ShareData & { files?: File[] }) => boolean;
  share?: (data: ShareData & { files?: File[] }) => Promise<void>;
};

/** Uses the Web Share API to open the native OS share sheet — Gmail, WhatsApp,
 * Bluetooth, Nearby Share, whatever's registered — so the user isn't limited
 * to just saving a file locally.
 *
 * The file is attached as `.txt`/`text/plain`, not `.json`/`application/json`.
 * Chromium and WebKit's file-sharing implementation only allows attaching
 * files whose extension is on a fixed safe-list (images, audio, video, PDF,
 * plain text, common office docs) — `.json` isn't on it, so `canShare()`
 * with a `.json` file always returns false and silently falls through to a
 * download, making Share indistinguishable from Download. The content is
 * byte-identical either way — `parseStyleTemplateImport` only reads the raw
 * text, it never looks at the file extension — so re-packaging as `.txt`
 * costs nothing on the import side (see the Import file input's `accept`,
 * which lists both extensions for exactly this reason) and gets a real
 * file attachment through the share sheet instead of a fallback download. */
export const shareStyleTemplateJson = async (
  template: StyleTemplate
): Promise<"shared" | "shared-text" | "downloaded"> => {
  const json = buildJson(template);
  const nav = navigator as ShareCapableNavigator;
  const shareMeta = { title: `${template.name} — vgAI2 Style Template` };

  if (nav.share) {
    const file = new File([json], textFileName(template), { type: "text/plain" });
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ ...shareMeta, files: [file] });
        return "shared";
      } catch (err) {
        // AbortError just means the user dismissed the native share sheet —
        // not a failure, and not something to fall back for.
        if (err instanceof Error && err.name === "AbortError") return "shared";
        // Any other failure (e.g. the share target rejected the file) falls
        // through to the text-share attempt below.
      }
    }

    // No file-share support, or the attempt above failed — fall back to a
    // text share. Level 1 of the Web Share API (title/text/url, no files)
    // has none of the file-type restrictions above and is supported
    // anywhere navigator.share exists, so this still opens a real share
    // sheet rather than silently downloading. The recipient gets the raw
    // JSON in the message body and can paste it into a .json/.txt file to
    // import it themselves.
    try {
      await nav.share({ ...shareMeta, text: json });
      return "shared-text";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared-text";
    }
  }

  downloadStyleTemplateJson(template);
  return "downloaded";
};
