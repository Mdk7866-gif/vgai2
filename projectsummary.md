# vgAI — Project Summary & Architecture Guide

A production-grade AI studio SaaS designed specifically for **AI faceless video creators** and long-form storytelling channels (e.g., educational, financial, historical explanation channels). Instead of generating an entire video in a single uneditable click, **vgAI** provides creators with an organized, granular workspace to manage the entire script-to-scene workflow, generate consistent media assets, and export them seamlessly for post-production editing. 

---

## 1. Product Vision & Target Audience

Most long-form YouTube creators work in distinct phases:
1. Researching topics and writing a script.
2. Breaking the script down into key visual beats or scenes.
3. Defining character assets and visual styles.
4. Generating matching images, voiceovers, and animations.
5. Stitching assets together inside editing software (e.g., Adobe Premiere Pro, CapCut).

Existing tools typically generate fully-baked, uneditable video files or provide single-scene interfaces without context. **vgAI** acts as a multi-tenant **Creator Operating System**, bringing structure, character consistency, granular asset controls, and professional-grade post-production exporters into a single unified workspace.

---

## 2. Core Workflow & Features

### 📱 Theming, UI & Mobile Responsiveness
*   **Mobile-First & Fully Responsive:** The entire platform is built to provide an excellent user experience across all devices. Whether on a desktop or a mobile phone, creators can manage projects, edit scripts, and generate assets seamlessly.
*   **Dark / Light Mode:** Features a seamless dark and light mode toggle, allowing creators to work comfortably in any environment.

### 🧠 AI Script Generation & Topic Research
*   **Intelligent Topic Research:** Users can choose a category (e.g., Finance, Entertainment, Education, Story) and provide a basic description.
*   **Topic Research (Default: Perplexity):** The system uses Perplexity to search the internet and suggest the **Top 10 trending/best topics** matching the criteria.
*   **One-Click Scripting (Default: Claude):** After selecting a topic, the user can click "Generate Script". A Claude model generates a full-length script and directly imports it into a new project. 
*   **Model Flexibility:** While Claude and Perplexity are the defaults, users can select alternative models from **OpenRouter**.

### 📂 Reusable Resource Libraries (Style Templates & Characters)
Before working on a script, creators can define libraries of reusable assets to maintain style consistency:
*   **Characters:** Store consistent characters with names, descriptions, and "character sheet" images.
*   **Style Templates:** Save unified visual styles that combine names, descriptions, **Image Prompts**, **Animation Prompts** (e.g., *Family Guy* style 2D sitcom, 3D cartoon, hyper-realistic, illustration), and custom YouTube packaging prompts (**YouTube Title Prompt**, **YouTube Description & Tags Prompt**, and **YouTube Thumbnail Image Prompt**) to standardize branding and packaging styles across generated videos.

### ⚙️ Sidebar & Project Management
Creators organize their work into **Projects**. The sidebar lets them quickly switch between projects. Each project acts as an isolated sandbox for the user.

### 📝 Intelligent Script-to-Scene Splitting
When a creator pastes their script, they select a **Characters** involved in the script, **Style Template**, **Voiceover** and  **Scene Density** and click **Generate Scenes**. Using LLM reasoning (**Default model:** `gemini-3.1-pro-preview` via OpenRouter):
*   The script is semantically split into logical scenes.
*   **Scene Density** controls target segment sizes:
    *   **Small:** 1-10 words per scene.
    *   **Medium:** 10-15 words per scene.
    *   **High:** 15-25 words per scene.
*   The system generates an optimized scene layout. Image/Animation prompts are driven by the project's selected Style Template.

### 🎤 Project-Level Voiceover Generation (ElevenLabs)
*   **Handling Long Scripts:** Because long-form scripts often exceed 50,000 characters and ElevenLabs has a 5,000 character limit per request, voiceovers are handled at the **Project Level** rather than the scene level.
*   **Independent API:** The ElevenLabs API is kept entirely separate from OpenRouter to ensure dedicated TTS quality control.
*   **Chunking & Stitching:** The backend automatically chunks the script into multiple voiceover segments. 
*   **Export Flexibility:** Users can either download these voiceover segments individually or have the backend stitch them together into a single master audio file using **FFmpeg**.

### 📺 Automated YouTube Packaging
For YouTube and faceless creators, vgAI auto-generates packaging metadata alongside the scene breakdown, guided by the custom prompts defined in the project's selected Style Template (or fallback defaults):
*   **Video Title:** Highly engaging titles optimized for CTR, generated using the **YouTube Title Prompt**.
*   **Description & Tags:** SEO-friendly descriptions and keyword tags generated using the **YouTube Description & Tags Prompt**.
*   **Thumbnail Prompt:** Optimized image prompt to generate a thumbnail, generated using the **YouTube Thumbnail Image Prompt**.
*   **Thumbnail Image:** Direct generation and download of the final video packaging thumbnail.

### 🎴 Granular Scene Cards & Async Generation
Each scene is represented as a card containing:
*   **Editable Scene Text:** Adjust the narrative flow.
*   **Image & Animation Prompts:** Creators can tweak AI prompts directly on the card.
*   **Asynchronous Generation:** 
    *   Images and Animations are generated via background tasks.
    *   UI updates with real-time status indicators (`pending`, `generating`, `completed`, `failed`).
    *   **Image Generation:** Visual frames matching characters and style. (**Default model:** `gpt-image-2` with `size="1792x1024"`, `quality="low"` via OpenRouter. Users can select other image models).
    *   **Animation Generation:** Uses reference-image-to-video models (e.g., Google Veo 3.0).
*   **Add / Delete / Reorder:** Creators can easily inject new cards above/below or delete cards to fine-tune pacing.

### 💰 Credits, Monetization & Payments (Razorpay)
*   **Credit System:** As a SaaS, vgAI tracks user consumption using a prepaid credit system. The `users` table tracks their current credit balance and lifetime spent credits across different modalities (LLM, Image, Animation, Voiceover).
*   **Payment Gateway:** Integrated with **Razorpay** to handle secure, global transactions. Users can purchase credit top-ups.
*   **Top-up Tracking:** Every transaction is securely logged in the `credit_topups` table, complete with Razorpay order IDs, signatures, amount paid, and the status of the transaction (`pending`, `success`, `failed`, `refunded`).

### 💾 Auto-Save & Snapshots
*   Every change to scene text, prompts, and settings is automatically saved in the background.
*   **Snapshots:** When a project imports a character or style template, it stores a local snapshot. If the user edits the global template later, existing projects remain unaffected.

### ⚡ Folder-Structure Media Exporter
Once media assets are generated, creators use the one-click export pipeline:
1.  **Export Directory Picker:** Integrates the browser's modern **File System Access API** (`showDirectoryPicker`).
2.  **Organized Subfolders:** The exporter automatically creates/updates subfolders: `images/`, `animations/`, and `voiceovers/`.
3.  **Clean Naming Convention:** Assets are named logically (e.g., `1.png`, `1.mp4`, `part1.mp3`).
4.  **Thumbnail Export:** The generated YouTube thumbnail is saved as `thumbnail.png` in the root.

---

## 3. Tech Stack

### 💻 Frontend
Built on a modern React structure with next-generation layout components:
*   **Framework:** Next.js (v16.2.6) with React (v19.2.4) using Client-side Rendering (`"use client"`).
*   **Styling:** Tailwind CSS v4.0.0, featuring comprehensive Dark/Light mode support.
*   **Icons:** Lucide React for consistent UI indicators.
*   **Type Safety:** TypeScript for robust, self-documenting data interfaces.
*   **Auth:** Integrated authentication provider (to support multi-tenancy).

### ⚙️ Backend
A fast, lightweight, asynchronous Python API layer:
*   **Framework:** FastAPI (v0.129.0) with Uvicorn.
*   **Language:** Python `>=3.13` (managed via `uv`).
*   **Database & Auth:** Supabase with Row Level Security (RLS) for multi-tenant isolation.
*   **Job Processing:** Async workers to handle generation states (`pending` -> `completed`) and FFmpeg audio stitching.
*   **Payments:** Razorpay API for handling checkout and verifying webhooks.
*   **AI Integration:**
    *   **OpenRouter API:** Acts as the unified AI gateway for LLM and image generation, providing users with a dropdown of alternative models. 
        *   *Default Scene Splitter:* `gemini-3.1-pro-preview`
        *   *Default Image Gen:* `gpt-image-2` (`size="1792x1024"`, `quality="low"`)
        *   *Default Script Gen:* `claude`
        *   *Default Topic Research:* `perplexity`
    *   **ElevenLabs:** Integrated independently of OpenRouter for dedicated, high-quality, chunked Text-to-Speech voiceover generation.
    *   `google-genai` for Veo video generation (or other models not handled via OpenRouter).
    *   `cloudinary` for media hosting and delivery.

---

## 4. Database Schema (DBML)

The database has been upgraded to a multi-tenant SaaS model, with explicit credit tracking, payment gateway integrations (Razorpay), status enums for async tasks, and consolidated style templates.

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

Table users {
  id uuid [pk, default: `gen_random_uuid()`]

  name varchar(200)
  email varchar(255) [not null, unique]
  profile_image_url text

  // Credits
  current_credit_balance numeric [not null, default: 0]

  // Lifetime credit usage
  image_credits_spent numeric [not null, default: 0]
  llm_credits_spent numeric [not null, default: 0]
  animation_credits_spent numeric [not null, default: 0]
  voiceover_credits_spent numeric [not null, default: 0]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table projects {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  name varchar(200) [not null]
  script text

  // small = 1-10 words
  // medium = 10-15 words
  // high = 15-25 words
  scene_density scene_density [not null, default: 'small']

  // AI Models
  llm_model_id varchar(200)
  image_model_id varchar(200)
  animation_model_id varchar(200)

  // Snapshot of selected Style Template
  snapshot_styletemplate_name varchar(200)
  snapshot_styletemplate_image_prompt text
  snapshot_styletemplate_animation_prompt text
  snapshot_styletemplate_youtube_title_prompt text
  snapshot_styletemplate_youtube_description_tags_prompt text
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

  image_prompt text [not null]
  animation_prompt text [not null]
  youtube_title_prompt text
  youtube_description_tags_prompt text
  youtube_thumbnail_image_prompt text
  description text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table characters {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  name varchar(200) [not null]
  description text [not null]
  character_sheet_url text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table generate_scripts {
  id uuid [pk, default: `gen_random_uuid()`]

  user_id uuid [not null]

  category varchar(200) [not null]
  description text [not null]

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

  generated_image_model varchar(200)
  generated_animation_model varchar(200)

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
Ref: generate_scripts.user_id > users.id
Ref: credit_topups.user_id > users.id

Ref: project_characters.project_id > projects.id
Ref: scenes.project_id > projects.id
Ref: project_voiceovers.project_id > projects.id

Ref: scene_characters.scene_id > scenes.id
Ref: scene_characters.project_character_id > project_characters.id
```
