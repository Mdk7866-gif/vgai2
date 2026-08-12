export type GenerationStatus = "pending" | "generating" | "completed" | "failed";

export interface InvolvedCharacterRef {
  id: string;
  name: string;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  scene_text: string;
  scene_image_prompt: string | null;
  scene_animation_prompt: string | null;
  generated_image_url: string | null;
  generated_animation_url: string | null;
  image_status: GenerationStatus;
  animation_status: GenerationStatus;
  involved_characters: InvolvedCharacterRef[];
  created_at: string;
  updated_at: string;
}

/** Shared response shape for both /generate_automatic and /generate_manual —
 * same fields either way, only how the scene split was produced differs. */
export interface GenerateScenesResponse {
  scenes: Scene[];
  title_of_video: string;
  description_of_video: string;
  tags_of_video: string;
  thumbnail_prompt: string;
  credits_spent: number;
  credits_remaining: number;
}

export interface GenerateSceneImageResponse {
  scene: Scene;
  credits_spent: number;
  credits_remaining: number;
}

export interface GenerateSceneAnimationResponse {
  scene: Scene;
  credits_spent: number;
  credits_remaining: number;
}

export interface GenerateThumbnailResponse {
  thumbnail_image_url: string;
  credits_spent: number;
  credits_remaining: number;
}
