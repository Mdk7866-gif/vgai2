import type { SceneDensity } from "@/types/styletemplate";

/** The exact payload shape `POST /styletemplates/create` expects (minus
 * `is_default`, which the import flow always sends as `false` — importing a
 * shared file should never silently steal the user's existing default). */
export interface StyleTemplateImportPayload {
  name: string;
  description: string;
  image_prompt: string;
  animation_prompt: string;
  youtube_title_description_tags_prompt: string | null;
  youtube_thumbnail_image_prompt: string | null;
  scene_density: SceneDensity;
  image_aspect_ratio: string;
  video_aspect_ratio: string;
  best_for: string | null;
  demo_image_url: string | null;
}

// Kept numerically in sync with EditStyleTemplateCardPopUp.tsx's own word
// ceilings — an import that slipped past validation here would fail the edit
// form's own validation the moment the user tried to save it back.
const NAME_MAX_CHARS = 200;
const IMAGE_PROMPT_MAX_WORDS = 300;
const ANIMATION_PROMPT_MAX_WORDS = 200;
const DESCRIPTION_MAX_WORDS = 150;
const YOUTUBE_PROMPT_MAX_WORDS = 150;
const BEST_FOR_MAX_CHARS = 200;

const VALID_ASPECT_RATIOS = ["16:9", "9:16"] as const;
const VALID_SCENE_DENSITIES: SceneDensity[] = ["small", "medium", "high"];

export class StyleTemplateImportError extends Error {}

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

const requireString = (
  data: Record<string, unknown>,
  field: string,
  { maxWords, maxChars }: { maxWords?: number; maxChars?: number } = {}
): string => {
  const value = data[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new StyleTemplateImportError(`"${field}" is missing or empty.`);
  }
  const trimmed = value.trim();
  if (maxChars && trimmed.length > maxChars) {
    throw new StyleTemplateImportError(`"${field}" is too long (max ${maxChars} characters).`);
  }
  if (maxWords && countWords(trimmed) > maxWords) {
    throw new StyleTemplateImportError(`"${field}" is too long (max ${maxWords} words).`);
  }
  return trimmed;
};

const optionalString = (
  data: Record<string, unknown>,
  field: string,
  { maxWords, maxChars }: { maxWords?: number; maxChars?: number } = {}
): string | null => {
  const value = data[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new StyleTemplateImportError(`"${field}" must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (maxChars && trimmed.length > maxChars) {
    throw new StyleTemplateImportError(`"${field}" is too long (max ${maxChars} characters).`);
  }
  if (maxWords && countWords(trimmed) > maxWords) {
    throw new StyleTemplateImportError(`"${field}" is too long (max ${maxWords} words).`);
  }
  return trimmed;
};

/** Parses and strictly validates a shared style-template JSON file's raw text
 * into a payload ready to POST to `/styletemplates/create`. Throws
 * `StyleTemplateImportError` with a specific, user-facing reason for the
 * first thing wrong with the file — malformed JSON, a missing/empty required
 * field, a field over its word/character ceiling, an invalid enum value, a
 * mismatched aspect-ratio pair, or a malformed demo image URL — rather than
 * silently coercing or truncating bad data, since a corrupted or hand-edited
 * import should fail loudly instead of creating a broken template. */
export function parseStyleTemplateImport(raw: string): StyleTemplateImportPayload {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new StyleTemplateImportError("This file isn't valid JSON.");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new StyleTemplateImportError("This file doesn't contain a single style template object.");
  }
  const obj = data as Record<string, unknown>;

  const name = requireString(obj, "name", { maxChars: NAME_MAX_CHARS });
  const imagePrompt = requireString(obj, "image_prompt", { maxWords: IMAGE_PROMPT_MAX_WORDS });
  const animationPrompt = requireString(obj, "animation_prompt", { maxWords: ANIMATION_PROMPT_MAX_WORDS });
  const description = requireString(obj, "description", { maxWords: DESCRIPTION_MAX_WORDS });

  const youtubeTitleDescriptionTagsPrompt = optionalString(obj, "youtube_title_description_tags_prompt", {
    maxWords: YOUTUBE_PROMPT_MAX_WORDS,
  });
  const youtubeThumbnailImagePrompt = optionalString(obj, "youtube_thumbnail_image_prompt", {
    maxWords: YOUTUBE_PROMPT_MAX_WORDS,
  });
  const bestFor = optionalString(obj, "best_for", { maxChars: BEST_FOR_MAX_CHARS });

  const sceneDensityRaw = obj.scene_density;
  if (typeof sceneDensityRaw !== "string" || !VALID_SCENE_DENSITIES.includes(sceneDensityRaw as SceneDensity)) {
    throw new StyleTemplateImportError(`"scene_density" must be one of: ${VALID_SCENE_DENSITIES.join(", ")}.`);
  }

  const imageAspectRatio = obj.image_aspect_ratio;
  const videoAspectRatio = obj.video_aspect_ratio;
  if (typeof imageAspectRatio !== "string" || !VALID_ASPECT_RATIOS.includes(imageAspectRatio as typeof VALID_ASPECT_RATIOS[number])) {
    throw new StyleTemplateImportError(`"image_aspect_ratio" must be one of: ${VALID_ASPECT_RATIOS.join(", ")}.`);
  }
  if (typeof videoAspectRatio !== "string" || !VALID_ASPECT_RATIOS.includes(videoAspectRatio as typeof VALID_ASPECT_RATIOS[number])) {
    throw new StyleTemplateImportError(`"video_aspect_ratio" must be one of: ${VALID_ASPECT_RATIOS.join(", ")}.`);
  }
  if (imageAspectRatio !== videoAspectRatio) {
    throw new StyleTemplateImportError(
      `"image_aspect_ratio" and "video_aspect_ratio" must match — vgAI uses a single aspect-ratio picker for both.`
    );
  }

  let demoImageUrl: string | null = null;
  const demoImageUrlRaw = obj.demo_image_url;
  if (demoImageUrlRaw !== null && demoImageUrlRaw !== undefined) {
    if (typeof demoImageUrlRaw !== "string") {
      throw new StyleTemplateImportError(`"demo_image_url" must be a URL string.`);
    }
    const trimmed = demoImageUrlRaw.trim();
    if (trimmed !== "") {
      try {
        new URL(trimmed);
      } catch {
        throw new StyleTemplateImportError(`"demo_image_url" isn't a valid URL.`);
      }
      demoImageUrl = trimmed;
    }
  }

  return {
    name,
    description,
    image_prompt: imagePrompt,
    animation_prompt: animationPrompt,
    youtube_title_description_tags_prompt: youtubeTitleDescriptionTagsPrompt,
    youtube_thumbnail_image_prompt: youtubeThumbnailImagePrompt,
    scene_density: sceneDensityRaw as SceneDensity,
    image_aspect_ratio: imageAspectRatio,
    video_aspect_ratio: videoAspectRatio,
    best_for: bestFor,
    demo_image_url: demoImageUrl,
  };
}
