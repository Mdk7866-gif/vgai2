export type ContentType = "long_videos" | "short_videos";

export interface ScriptTemplate {
  id: string;
  user_id: string;
  category: string;
  topic_description: string;
  script_description: string;
  content_type: ContentType;
  target_country: string;
  script_word_length: string;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ViralTopic {
  title: string;
  reason: string;
}

export interface InvolvedCharacter {
  name: string;
  age: number | null;
  gender: string | null;
  profession: string | null;
  appearance_description: string | null;
}

export interface GeneratedScript {
  /** DB id (generated_scripts.id) — used to key the card and to call Improvise. */
  id: string;
  script_template_id: string;
  topic: string;
  script: string;
  word_count: number;
  characters: InvolvedCharacter[];
  script_word_length: string;
}
