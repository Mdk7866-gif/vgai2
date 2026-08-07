export type SceneDensity = "small" | "medium" | "high";

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
  created_at: string;
  updated_at: string;
}
