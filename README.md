# vgAI — Project Summary & Architecture Guide

A production-grade AI studio SaaS designed for **AI faceless video creators** and long-form storytelling channels (educational, financial, historical, story-based content, etc.). Instead of generating an entire video in a single uneditable click, **vgAI** gives creators an organized, granular workspace to go from script → scenes → media assets, with full control at every step, for both **long-form videos** and **short-form videos** (YouTube Shorts style).

---

## 1. Product Vision

Long-form and short-form content creators typically work in distinct phases:

1. Researching topics and writing a script.
2. Breaking the script down into visual scenes/beats.
3. Defining character assets and a consistent visual style.
4. Generating matching images, voiceovers, and animations.
5. Stitching everything together in editing software (Premiere Pro, CapCut, etc.).

vgAI acts as a multi-tenant **Creator Operating System**: reusable character/style libraries, a scene-by-scene workspace, async media generation, and export-ready assets — all in one place.

---

## 2. Credits — The vgAI Currency

To keep pricing simple for users, all AI usage (LLM, image, animation, voiceover, and miscellaneous generations like script/character-sheet/style-template generation) is billed in an internal currency called **credits**:

> **100 credits = $1**

Every user has a `current_credit_balance`. Spend is tracked two ways:

- **Per-project spend** — recorded in `project_expence_tracker`, broken down into `llm_credit_spent`, `image_credit_spent`, `animation_credit_spent`, and `voiceover_credit_spent`. This table stores a **snapshot** of the project id/name (no foreign key) specifically so spend history survives even if the user later deletes the project.
- **Miscellaneous spend** — actions not tied to a project (script generation, character-sheet generation, style-template generation) are tracked on the user directly via `miscellaneous_credit_spent`.

---

## 3. Frontend Routes

| Route | Description |
|---|---|
| `/` | Home |
| `/project_folder/{project_id}` | Dynamic project workspace (Next.js dynamic route) |
| `/characters` | Character library |
| `/style_templates` | Style template library |
| `/liked_projects` | Liked projects |
| `/generate_script` | AI topic research & script generation |
| `/profile` | Account, balance, payment & usage history |
| `/login` | Google login only, via Supabase Auth |

---

## 4. Navigation

**Navbar**: Home, Profile, Logout.

**Sidebar** has two sections:

- **Library** — Characters, Style Templates, Generate Scripts, Liked Projects.
- **Project Folders** — lists all of the user's projects (click to open `/project_folder/{project_id}`). At the bottom, the user can type a name and create a new project directly from the sidebar.

---

## 5. Page-by-Page Features

### `/characters`

- Full CRUD: add, update, delete characters.
- **Generate Character Sheet** button: user enters a character name, a brief description, and optionally a reference image. The backend uses **Gemini** (text reasoning) plus **OpenAI** (image generation) to produce a character sheet image. The user reviews and accepts it, and it's added to their character library.

### `/style_templates`

- Full CRUD: add, edit, delete style templates.
- Each style template defines: `image_prompt`, `animation_prompt`, YouTube packaging prompts, a `description`, a `scene_density`, and — importantly — its own **`image_aspect_ratio`** and **`video_aspect_ratio`** (e.g. `16:9`, `9:16`, `1:1`). This is what lets vgAI support both long-form landscape videos and short-form vertical videos: whichever style template a project imports determines the aspect ratio of everything generated in that project.
- **Generate Style Template** button: user provides a name and description, and **Gemini** generates a full style template (prompts + description) for review before it's accepted and added to the library.

### `/liked_projects`

- Shows all project folders the user has liked (liked via the heart/like control in the sidebar or project view).
- User can unlike a project or click through to open it.
- Like state (`projects.is_liked`) is a single source of truth read by both the sidebar and this page, so liking/unliking anywhere stays in sync everywhere instantly.

### `/generate_script`

1. User selects a `category`, and enters `topic_description`, `script_description`, and `video_type` (long-form video or YouTube Shorts).
2. **Get Top 10 Viral Topics** — calls **Perplexity** (via OpenRouter) to research the web and return 10 trending/relevant topic ideas for the given category/description.
3. User picks a topic and clicks **+ Generate Script** — **Claude** (via OpenRouter) writes a full script matching the `script_description`, along with a list of characters involved in the story (name, e.g. "Nick, 30, male", plus a brief physical appearance description).
4. The generated script can be imported directly into a project folder to start working on it.
5. **Improvise** — if the user doesn't like the result, they give feedback and Claude regenerates an improved script.

### `/profile`

- Shows `name`, `email`, and `current_credit_balance`.
- Tabbed view:
  - **Payment History** — every top-up from `credit_topups`: date, amount paid, credits added, and `payment_status`.
  - **Usage History** — every project's spend, sourced from `project_expence_tracker` (kept even after project deletion). Hovering a project shows its `llm_credit_spent`, `image_credit_spent`, `animation_credit_spent`, and `voiceover_credit_spent`. The page also totals across everything: `total_credit_spent`, `total_llm_credit_spent`, `total_image_credit_spent`, `total_animation_credit_spent`, `total_voiceover_credit_spent`, and `total_miscellaneous_credit_spent` (script/character-sheet/style-template generation).

### `/project_folder/{project_id}`

The core workspace. Here the user:

- Pastes/edits the `script`.
- Imports **characters** from `/characters` (saved as `project_characters` — a **snapshot**, so later edits to the global character don't retroactively change this project).
- Imports a **style template** from `/style_templates` (also snapshotted onto the project — `snapshot_styletemplate_*` fields — so future edits to the global template don't affect existing projects).
- Configures ElevenLabs voiceover settings (`vo_voice_id`, `vo_model_id`, `vo_stability`, `vo_similarity`, `vo_style`, `vo_speaker_boost`, `vo_speed`).
- Chooses which LLM / image / animation models to use for this project.

#### Automatic scene generation

Clicking **Generate Scenes (Automatic)** sends the script + the imported style template prompts + character sheets to **Gemini**, which splits the script into scenes. Each resulting scene includes `scene_text`, `scene_image_prompt`, `scene_animation_prompt`, and (once generated) `generated_image_url` / `generated_animation_url`. Scenes render as **scene cards** where the user can:

- Generate the scene's image (**OpenAI**, driven by `scene_image_prompt`).
- Generate the scene's animation (driven by the generated image + `scene_animation_prompt`).
- Edit scene text/prompts, add, delete, or reorder cards.
- Track async status per asset via `image_status` / `animation_status` (`pending → generating → completed/failed`).

#### Manual scene generation

Clicking **Generate Scenes (Manual)** opens a popup with a ready-to-copy prompt (script + scene-splitting instructions + involved characters). The user pastes this into gemini.com themselves, copies back the structured JSON response, pastes it into the popup, and clicks **Generate**. This populates the exact same scene fields as the automatic flow — everything downstream (image/animation generation, cards, etc.) works identically either way.

#### Structured scene response

Whichever generation path is used, the AI returns a structured response containing:

- **`sceneData`** — an array of scenes: `scene_number`, `scene_text`, `scene_image_prompt`, `scene_animation_prompt`, `scene_involved_characters`.
- **`metadata`** — YouTube packaging: `video_title`, `video_description`, `video_tags`, `video_thumbnail_prompt`.
- **`compact_image_prompt`** — a token-saving prompt fragment for image generation. Rather than repeating the full style description in every single scene's image prompt, a shared style prefix constant is defined once and reused, e.g.:

  ```js
  const STYLE_PREFIX =
    "2D cartoon illustration, Family Guy inspired animation style, smooth clean color fills, " +
    "soft subtle shading, thin light outlines, NO thick black outlines, NO heavy borders, " +
    "bright and colorful. aspect ratio 16:9";
  ```

  Each scene's actual image prompt is composed from `STYLE_PREFIX` + the scene-specific detail, keeping per-scene prompts short and cheap. `scene_animation_prompt` is left uncompacted — animation generation is image-to-video (driven by `scene_animation_prompt` + the already-generated scene image), so the style is already carried by the reference image and doesn't need to be re-stated in the prompt text.

#### Voiceover generation

Clicking **Generate Voiceover** sends the script to **ElevenLabs**. Since ElevenLabs can only process ~5,000 characters per request, the backend automatically chunks the script into pieces and generates a voiceover per chunk (`project_voiceovers`, ordered by `voiceover_number`). The user can preview each chunk, and clicking **Stitch Audio** uses **FFmpeg** to merge all chunks into a single master audio file.

### `/login`

Google sign-in only, via **Supabase Auth**.

---

## 6. Tech Stack

### Frontend
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Language:** TypeScript

### Backend
- **Framework:** FastAPI, managed with the **uv** package manager
- **Orchestration:** LangChain
- **Database & Auth:** Supabase (Postgres + Row Level Security for multi-tenant isolation, Google OAuth)
- **AI Integrations:**
  - **Gemini API** — text generation (character sheets, style templates) and automatic scene/script splitting.
  - **OpenAI API** — character sheet images and scene image generation.
  - **OpenRouter** — gateway for **Perplexity** (viral topic research) and **Claude** (script generation & "improvise" regeneration).
  - **ElevenLabs API** — chunked text-to-speech voiceover generation, kept independent of OpenRouter for dedicated TTS quality control.
  - **FFmpeg** — stitching voiceover chunks into a single audio file.

---

## 7. Database Schema (DBML)

The full, current schema lives in [`vgaidatabase.dbml`](./vgaidatabase.dbml). Summary of tables:

- **`users`** — profile, `current_credit_balance`, `miscellaneous_credit_spent`.
- **`project_expence_tracker`** — historical per-project credit spend (`llm_credit_spent`, `image_credit_spent`, `animation_credit_spent`, `voiceover_credit_spent`), snapshotted by `project_id`/`project_name` so it survives project deletion.
- **`projects`** — script, `is_liked`, selected model ids, a full snapshot of the style template used, YouTube metadata, and ElevenLabs voice settings.
- **`style_templates`** — reusable visual styles: image/animation/YouTube prompts, `scene_density`, `image_aspect_ratio`, `video_aspect_ratio`, `is_default`.
- **`characters`** — reusable character library with `character_sheet_url` and `is_default`.
- **`script_templates`** — saved script-generation requests: `category`, `topic_description`, `script_description`, `content_type` (`long_videos` / `short_videos`).
- **`project_characters`** — per-project snapshot of imported characters.
- **`scenes`** — per-project scene breakdown: text, image/animation prompts, generated URLs, and generation status enums.
- **`scene_characters`** — join table linking scenes to the project characters involved in them.
- **`project_voiceovers`** — per-project voiceover chunks (pre-stitching).
- **`credit_topups`** — Razorpay-backed credit purchase history with `payment_status`.

```dbml
// ======================================
// vgAI Database Schema
// ======================================

Enum scene_density {
  small
  medium
  high
}

Enum generation_status {
  pending
  generating
  completed
  failed
}

Enum payment_status {
  pending
  success
  failed
  refunded
}

Enum content_type {
  long_videos
  short_videos
}

Table users {
  id uuid [pk, default: `gen_random_uuid()`]

  name varchar(200)
  email varchar(255) [not null, unique]
  profile_image_url text

  // Credits
  current_credit_balance numeric [not null, default: 0]
  miscellaneous_credit_spent numeric [not null, default: 0]


  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table project_expence_tracker {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  // Store project ID only for reference.
  // No foreign key so history remains even after project deletion.
  project_id uuid [not null]
  project_name varchar(200) [not null]

  llm_credit_spent numeric [not null, default: 0]
  image_credit_spent numeric [not null, default: 0]
  animation_credit_spent numeric [not null, default: 0]
  voiceover_credit_spent numeric [not null, default: 0]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table projects {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  name varchar(200) [not null]
  script text

  is_liked boolean [not null, default: false]

  // AI Models
  llm_model_id varchar(200)
  image_model_id varchar(200)
  animation_model_id varchar(200)

  // Snapshot of selected Style Template
  snapshot_styletemplate_name varchar(200)
  snapshot_styletemplate_image_prompt text
  snapshot_styletemplate_animation_prompt text
  snapshot_styletemplate_youtube_title_description_tags_prompt text
  snapshot_styletemplate_youtube_thumbnail_image_prompt text
  snapshot_styletemplate_description text

  // YouTube Metadata
  thumbnail_prompt text
  thumbnail_image_url text

  title_of_video text
  description_of_video text
  tags_of_video text

  // Voice Settings
  vo_voice_id text [default: '95etAma035P6Ys5iv7Oo']
  vo_model_id text [default: 'eleven_multilingual_v2']
  vo_stability numeric [default: 40]
  vo_similarity numeric [default: 70]
  vo_style numeric [default: 30]
  vo_speaker_boost boolean [default: true]
  vo_speed numeric [default: 0.88]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table style_templates {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  name varchar(200) [not null]
  is_default boolean [not null, default: false]

  image_prompt text [not null]
  animation_prompt text [not null]
  youtube_title_description_tags_prompt text
  youtube_thumbnail_image_prompt text

  // small = 1-10 words
  // medium = 10-15 words
  // high = 15-25 words
  scene_density scene_density [not null, default: 'small']
  image_aspect_ratio text [not null]
  video_aspect_ratio text [not null]
  description text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]

  indexes {
    // Note: Partial index enforced in DDL: WHERE is_default = true
    (user_id, is_default) [name: 'idx_user_default_style']
  }
}

Table characters {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]
  is_default boolean [not null, default: false]

  name varchar(200) [not null]
  description text [not null]
  character_sheet_url text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table script_templates {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  category varchar(200) [not null]
  topic_description text [not null]
  script_description text [not null]
  content_type content_type [not null, default: 'long_videos']

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table project_characters {
  id uuid [pk, default: `gen_random_uuid()`]

  project_id uuid [not null]

  snapshot_name varchar(200) [not null]
  snapshot_description text [not null]
  snapshot_character_sheet_url text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table scenes {
  id uuid [pk, default: `gen_random_uuid()`]

  project_id uuid [not null]

  scene_number int [not null]
  scene_text text [not null]

  scene_image_prompt text
  scene_animation_prompt text

  generated_image_url text
  generated_animation_url text

  image_status generation_status [not null, default: 'pending']
  animation_status generation_status [not null, default: 'pending']

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]

  indexes {
    (project_id, scene_number) [unique]
  }
}

Table scene_characters {
  id uuid [pk, default: `gen_random_uuid()`]

  scene_id uuid [not null]
  project_character_id uuid [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]

  indexes {
    (scene_id, project_character_id) [unique]
  }
}

Table project_voiceovers {
  id uuid [pk, default: `gen_random_uuid()`]

  project_id uuid [not null]

  voiceover_number int [not null]
  voiceover_url text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]

  indexes {
    (project_id, voiceover_number) [unique]
  }
}

Table credit_topups {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  // Razorpay Details
  razorpay_order_id varchar(255) [not null, unique]
  razorpay_payment_id varchar(255)
  razorpay_signature text

  // Payment
  amount_paid numeric [not null]
  currency varchar(10) [not null, default: 'INR']

  // Credits
  credits_added numeric [not null]

  // User's balance immediately after this top-up
  credits_balance_after numeric [not null]

  payment_status payment_status [not null, default: 'pending']

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}
// ==========================
// Relationships
// ==========================

Ref: projects.user_id > users.id
Ref: characters.user_id > users.id
Ref: style_templates.user_id > users.id
Ref: script_templates.user_id > users.id
Ref: credit_topups.user_id > users.id
Ref: project_expence_tracker.user_id > users.id

Ref: project_characters.project_id > projects.id
Ref: scenes.project_id > projects.id
Ref: project_voiceovers.project_id > projects.id

Ref: scene_characters.scene_id > scenes.id
Ref: scene_characters.project_character_id > project_characters.id
```

---

## 8. UI/UX Requirements

- **Light/dark theme toggle** is a required, first-class feature across the entire app — every page and component must support both themes cleanly (no unstyled/half-styled states in either mode).
- **Responsive, but desktop-first**: the site must remain usable down to mobile/tablet widths, but the primary design target is desktop/large screens, since the core user base is video editors/creators working at a desk on big monitors. Optimize the workspace-heavy pages (`/project_folder/{project_id}` scene grid, character/style-template libraries) for large-screen layouts first, and treat small-screen behavior as a graceful fallback rather than the primary design constraint.

---

## 9. Media Storage (Cloudinary)

All uploaded/generated media (character sheets, scene images, scene animations, voiceovers, project thumbnails) lives in one Cloudinary account, under a single root folder — `CLOUDINARY_FOLDER_NAME` in `backend/.env` (currently `vgai2`). Everything under that root is nested by owner, so a given user's or project's assets are easy to browse and safe to bulk-clean:

```
vgai2/
  <user_id>/
    characters/                  # character sheets from /characters (library, not tied to a project)
    <project_id>/
      project_characters/        # snapshots of characters imported into this project
      scene_images/
      scene_animation/
      voiceovers/
      thumbnail_image/           # generated YouTube thumbnail for this project
```

- `<user_id>` / `<project_id>` are the Supabase row UUIDs (`users.id`, `projects.id`).
- `upload_image()` (`backend/app/cloudinary.py`) takes a `folder` argument that is the path *under* the root — e.g. `f"{user_id}/characters"` or, once `/project_folder/{project_id}` exists, `f"{user_id}/{project_id}/scene_images"`. Callers build that path; the helper just prefixes the root folder and picks a unique `public_id`.
- `delete_media()` (same file) is the matching cleanup: it parses the `public_id` back out of a stored `secure_url` and deletes that asset from Cloudinary, so removing/replacing a row (a character today; scenes/voiceovers/thumbnails later) also removes its Cloudinary file instead of leaving it orphaned.
- **Current state**: only `<user_id>/characters/` is wired up, via the `/characters` CRUD routes. The `<project_id>/*` subfolders above are the target layout for the future `/project_folder/{project_id}` feature — scene image/animation generation, voiceover chunking, and thumbnail generation should each upload into their respective subfolder under that project once built.
