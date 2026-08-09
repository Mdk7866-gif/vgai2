import type { SceneDensity } from "./styletemplate";

export type LlmModelTier = "base" | "pro";
export type ImageModelTier = "base" | "pro";
export type AnimationModelTier = "base";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  script: string | null;
  is_liked: boolean;

  llm_model_id: LlmModelTier;
  image_model_id: ImageModelTier;
  animation_model_id: AnimationModelTier;

  snapshot_styletemplate_name: string | null;
  snapshot_styletemplate_image_prompt: string | null;
  snapshot_styletemplate_animation_prompt: string | null;
  snapshot_styletemplate_youtube_title_description_tags_prompt: string | null;
  snapshot_styletemplate_youtube_thumbnail_image_prompt: string | null;
  snapshot_styletemplate_description: string | null;
  snapshot_styletemplate_image_aspect_ratio: string | null;
  snapshot_styletemplate_video_aspect_ratio: string | null;
  snapshot_styletemplate_scene_density: SceneDensity | null;

  thumbnail_prompt: string | null;
  thumbnail_image_url: string | null;
  title_of_video: string | null;
  description_of_video: string | null;
  tags_of_video: string | null;

  vo_voice_id: string | null;
  vo_model_id: string | null;
  vo_stability: number | null;
  vo_similarity: number | null;
  vo_style: number | null;
  vo_speaker_boost: boolean | null;
  vo_speed: number | null;

  created_at: string;
  updated_at: string;
}

export interface ProjectCharacter {
  id: string;
  project_id: string;
  snapshot_name: string;
  snapshot_description: string;
  snapshot_character_sheet_url: string;
  created_at: string;
  updated_at: string;
}

export interface VoiceoverSettings {
  vo_voice_id: string;
  vo_model_id: string;
  vo_stability: number;
  vo_similarity: number;
  vo_style: number;
  vo_speaker_boost: boolean;
  vo_speed: number;
}
