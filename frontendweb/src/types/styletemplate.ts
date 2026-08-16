export type SceneDensity = "small" | "medium" | "high";

/**
 * One entry of the read-only starter catalog served by GET /styletemplates/defaults.
 * Not DB-backed — it has a `slug` instead of an `id` and no `user_id`/timestamps,
 * since nothing exists in style_templates until the user imports it.
 */
export interface DefaultStyleTemplate {
  slug: string;
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

export interface StyleTemplate {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  image_prompt: string;
  animation_prompt: string;
  youtube_title_description_tags_prompt: string | null;
  youtube_thumbnail_image_prompt: string | null;
  scene_density: SceneDensity;
  image_aspect_ratio: string;
  video_aspect_ratio: string;
  description: string;
  /** Content niches this style suits, e.g. "History, biography, philosophy". */
  best_for: string | null;
  /** Cloudinary sample frame rendered in this style, previewed on the card. */
  demo_image_url: string | null;
  created_at: string;
  updated_at: string;
}
