/**
 * One entry of the read-only starter catalog served by GET /characters/defaults.
 * Not DB-backed as a `characters` row — it has a `slug` instead of an `id` and
 * no `user_id`/`is_default`, since nothing exists in `characters` until the
 * user imports it.
 */
export interface DefaultCharacter {
  slug: string;
  name: string;
  description: string;
  character_sheet_url: string;
  best_for: string | null;
}

export interface Character {
  id: string;
  user_id: string;
  is_default: boolean;
  name: string;
  description: string;
  character_sheet_url: string;
  created_at: string;
  updated_at: string;
}
