# vgAI — Project Summary & Architecture Guide

Payment UI: checkout previews show INR without a hard-coded test-mode label. Successful top-ups and failed attempts that have a Razorpay payment ID expose that ID as a copyable support reference; pending attempts and failed attempts without an ID do not. When Payment History contains a failed attempt, it explains that no credits were added, a debited amount is usually automatically reversed within 5 working days (subject to bank processing), and how to contact support with the reference. Browser signature failures only mark still-pending orders failed, so they cannot overwrite a payment already settled by the webhook.

Sidebar organization: each project has an `is_hidden` preference. The eye-off control hides an inactive or completed folder without deleting its script, scenes, media, or other data. Hidden folders are omitted from the normal Project Folders list, remain available in a collapsed Hidden Projects section, and can be restored there. Multi-select deletion applies only to the visible list.

Workspace script copy: the project workspace has a Copy script control beside the word count. It copies the entire current editor value, including edits that have not yet been saved, shows an accessible temporary Copied state, and is disabled for an empty script.

Docker Hub deployment: use [DOCKERHUB_DEPLOY.md](./DOCKERHUB_DEPLOY.md) and
`compose.deploy.yaml` to pull `mdk7866/vgai2-backend` and
`mdk7866/vgai2-frontend` on EC2 without server-side builds. The runbook covers
first deployment and moving the site to an EC2 instance in another AWS account,
including DNS cutover and certificate issuance. The existing Dockerfiles and
.dockerignore files remain in each application directory.

Home and Liked Project cards always use a compact 16:9 thumbnail frame, including Reels projects. Portrait thumbnails use `object-contain` inside that frame, leaving a neutral background at the sides rather than making a tall card; the Home desktop grid shows four cards per row.

Consistency convention: all app/component brand accents use the shared `brand-*` Tailwind scale; use `bg-action text-action-foreground hover:bg-action-hover` for primary actions and `surface`/`border` for panels. These tokens preserve the light violet and dark lavender/charcoal treatment across form dialogs, tabs, cards, generators and checkout entry points. Semantic warning/error/success/credit colors and black media-preview backgrounds intentionally remain distinct. Pagination uses larger bordered controls with result announcements, toggles support an explicit accessible label, and the access-revoked dialog traps focus while retaining acknowledgement-only dismissal. ThemeProvider validates stored values, syncs other-tab changes, follows OS changes when no preference is saved, and still toggles when storage is blocked. AuthContext, CreditBalanceContext and ProjectsContext are data providers, not visual components; their business behavior remains unchanged.

A production-grade AI studio SaaS designed for **AI faceless video creators** and long-form storytelling channels (educational, financial, historical, story-based content, etc.). Instead of generating an entire video in a single uneditable click, **vgAI** gives creators an organized, granular workspace to go from script → scenes → media assets, with full control at every step, for both **long-form videos** and **short-form videos** (YouTube Shorts style).

> **Documentation maintenance:** Feature work is not complete until this README, `AGENTS.md`, and the shared `PROJECT_CONTEXT.md` reflect any material behavior or architecture changes. Cross-application and shared-schema changes must be documented in the matching `README.md` and `AGENTS.md` files in the sibling `vgai2admin` repository too.

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

- **Per-project spend** — recorded in `project_expence_tracker`, broken down into `llm_credit_spent`, `image_credit_spent`, `animation_credit_spent`, and `voiceover_credit_spent`. This table stores a **snapshot** of the project id/name (no foreign key) specifically so spend history survives even if the user later deletes the project. There is exactly one running-total row per project, not one row per spend event.
- **Miscellaneous spend** — actions not tied to a project (script generation, character-sheet generation, style-template generation) are tracked on the user directly via `miscellaneous_credit_spent`.

### First-login welcome bonus

Each newly created account receives **20 free credits** at its first successful
backend sign-in. The database creates the user, updates the balance, and writes
one `admin_credit_grants` row with `grant_kind = 'welcome'` in the same atomic
operation, so repeated authentication callbacks cannot award it twice. Profile
history calls this **Welcome bonus — your first login**. It is free credit,
never a Razorpay purchase, and is excluded from all purchase totals.

### Credits are charged when a generation *starts*

Credits are **reserved before the AI provider is called**, not deducted after it succeeds. Every provider (OpenAI, OpenRouter, ElevenLabs) bills vgAI the moment the work begins, so charging only on success meant absorbing the cost of anything a user started and then abandoned. Concretely:

- **Starting a generation deducts immediately.** The balance in the navbar drops on click, not on completion.
- **Cancelling does not refund.** The provider has already been paid. What cancelling *does* guarantee is that the abandoned result is thrown away rather than saved — see "Cancelling a generation" under `/project_folder/{project_id}` below.
- **Credits come back only when the provider produced nothing** — it errored out, or the request was rejected before reaching it. That refund is automatic.
- **Concurrent generations each cost their full price.** Firing image generation on eight scene cards at once charges for eight. The balance is deducted through an atomic database function (`spend_credits`), so simultaneous requests can't read the same starting balance and each overwrite the others' deduction.
- **The manual flows charge when the prompt is handed over, not when a result comes back.** "Generate Scenes (Manual)" and "Generate All Images (Manual)" call no AI provider — what they give the user is a ready-made prompt to run in their own Gemini/meta.ai session. That prompt *is* the product, so both deduct on the trigger click, before the popup opens. Charging on the way out instead would make either feature optional to pay for: copy the prompt, close the popup, do the work elsewhere. The upside for the user is that everything after the popup opens is free — pasting a scene-split response back can be retried as often as needed without paying again.

---

## 3. Frontend Routes

| Route | Description |
|---|---|
| `/` | Home; while access mode is `allowed_only`, shows the public access-request form |
| `/project_folder/{project_id}` | Dynamic project workspace (Next.js dynamic route) |
| `/characters` | Character library |
| `/style_templates` | Style template library |
| `/liked_projects` | Liked projects |
| `/generate_script` | AI topic research & script generation |
| `/profile` | Account, balance, payment & usage history |
| `/contact` | Support form — name, email or mobile, issue description, optional screenshot |
| `/privacy-policy` | Static privacy policy (13 sections, no backend) |
| `/about` | Product introduction and studio/support links |
| `/login` | Google login only, via Supabase Auth |

---

## 4. Navigation

Dark mode now uses neutral charcoal backgrounds, raised surfaces, readable slate text and lavender accents across pages, controls, tables and portaled dialogs; light mode is largely preserved. Profile, Contact, Login, privacy navigation, generation controls and payment/library dialogs share the visual system. Reduced motion is respected. Shared login/alert/confirmation/account dialogs support focus cycling, Escape and focus restoration; mobile navigation keeps background chrome inert while open. The privacy table of contents is available on mobile, and scene editor/media columns stack until extra-large screens.

UX continuation: Characters and Style Templates share `LibrarySearch.tsx` with name/description search, live result counts, and clear/reset empty states; style search combines with the existing aspect-ratio filter before pagination. The shell includes a skip-to-content link; opening mobile navigation focuses Close, Escape from the sidebar closes it, closing restores trigger focus, and resizing to desktop closes the mobile state. The menu trigger exposes expanded/controls state and the theme button names its target theme. The project workspace has a matching header, a labeled script field explaining existing save-on-blur behavior, and a clearer Voiceover settings label (no TTS functionality added).

The script studio uses a three-step workflow guide and matching violet light/dark styling. Liked Projects supports client-side name search before pagination with result counts and a clear-search empty state. Library/project cards use coordinated rounded surfaces; character sheets display uncropped and open through keyboard-accessible preview buttons, and project unlike buttons sit outside navigation links. The About page is a real product introduction rather than a coming-soon stub.

The refreshed studio shell uses violet-accented active navigation and an Overview shortcut. Project names are keyboard-operable buttons; renaming happens only from the project workspace. Characters and Style Templates use coordinated light/dark gradient headers and wrapping action groups for narrow screens. Home has an interactive three-step explanation and real project shortcuts, without simulated generation progress or sample statistics.

**Navbar**: Home, Profile, Logout.

**Sidebar** has two sections:

- **Library** — Characters, Style Templates, Generate Scripts, Liked Projects.
- **Project Folders** — lists all of the user's projects (click to open `/project_folder/{project_id}`). Each row's hover tooltip provides the full project name and creation date; project names are renamed only in the workspace. A Select mode supports selecting any number of folders and permanently deleting them together after confirmation. At the bottom, the user can type a name and create a new project directly from the sidebar.

---

## 5. Page-by-Page Features

### `/` — product home and invite-only access requests

Home quickly explains what vgAI does: turn scripts into scene-by-scene images and animations, then download those assets for assembly in an external video editor. New visitors can select three workflow steps to learn the process; returning users see their newest project and a searchable project grid with real thumbnails, six-at-a-time expansion, and empty/loading states. Create opens a real project without triggering paid generation. An invite-only visitor sees Request access as the primary action. Repeated marketing sections, the duplicate welcome panel, and the artificial 2.5-second first-visit splash are removed.

`HomePageAllowOnlyTheseUserAccessCard.tsx` uses `AuthContext`'s resolved user and public access mode to choose the correct panel. Its request form renders only for a **signed-out** visitor while mode is `allowed_only`; Home uses its own hero/dashboard for signed-in users and open-access visitors, so the standalone welcome branch of this component is not mounted there. The form accepts the Google-account email plus an optional description of what the visitor plans to create, and submits without requiring authentication to `POST /access-requests/`. One normalized email has one `user_access_requests` row: pending/approved submissions are returned idempotently, while a denied request may be submitted again and becomes pending. The admin reviews these in vgai2admin's `/useraccessrequest`; approval adds the email to the existing `access_control_list` allowed list. Admins may permanently delete approved/denied request history afterward; deleting an approved request deliberately does not remove its separate allow-list entry. Migration `vgai2admin/migration/002_user_access_requests.sql` is applied to the shared Supabase project.

### `/characters`

- Full CRUD: add, update, delete characters.
- **Starter Characters**: a read-only catalog of product-made characters, browsable in a big popup opened from a "Starter Characters" button on the page — each shown as a card with its sheet image, a "Best for" hint, its description, and an "Add to Library" button that copies it into the user's own library in one click, ready to edit or delete freely afterward. Importing the same one twice is allowed and makes two independent copies; later edits to the catalog only affect characters imported after the edit, not ones already in a library. The catalog is edited from the vgai2admin portal (`/defaultcharacter`), and an import makes a real Cloudinary copy of the sheet (§9), so removing a catalog entry can never blank an image someone already imported. An imported character is never auto-marked default — a default character gets snapshotted into every new project, so that stays an explicit opt-in via the card's own "Set default" toggle.
- **Generate Character Sheet** button: user enters a character name, a brief description, and optionally a reference image. The backend uses **OpenAI** end-to-end — `ChatOpenAI` (LangChain) writes a detailed character-sheet image prompt (front/3-4/back/left-profile/right-profile views plus happy/sad/angry/confused/thinking/surprised expression close-ups, laid out as a labeled two-row grid on a **plain pure-white backdrop** — sheets get composited over other backgrounds later, so the prompt-writing step is explicitly instructed to demand flat white with no scenery, gradient, texture, or cast shadows), then `gpt-image-2` renders it. A "Generate with Pro" toggle switches the render from `quality="low"` (4 credits) to `quality="high"` (8 credits). Both the supplied description and generated image prompt are capped at 300 words in the browser and backend; the user reviews the sheet before accepting it into their library, where that generated prompt is stored as the character's `description`.

### `/contact`

- A support form, reachable from the navbar. Asks for a **name**, an **email or mobile number** (either — free text, whichever is easiest to reach the user on), a **description of the issue**, and an **optional screenshot** (images only, up to 10 MB).
- **Usable signed-out**, and deliberately so: a user whose access was revoked is signed out the moment the backend rejects them, and someone who can't sign in at all still has to be able to report that. Gating this behind login would lock out exactly the people who most need it. When there *is* a session, the name and contact fields are prefilled from it (still editable) and the submission is attributed to that account.
- Submissions are not visible anywhere in vgAI — there's no "my tickets" view. They're read and worked from the **vgai2admin** portal's `/contact` page, which is also where a screenshot is viewed full size. Nothing sends email; support replies by hand using the contact detail given.

### `/style_templates`

- Full CRUD: add, edit, delete style templates.
- The main create/edit form only asks for what a user needs to give every time: `name`, `image_prompt`, `animation_prompt`, a single **aspect ratio** picker — **"16:9 (Long Video)"** or **"9:16 (Reels)"** (both `image_aspect_ratio` and `video_aspect_ratio` are set from this one choice; `1:1` isn't offered) — and the `is_default` toggle. This is what lets vgAI support both long-form landscape videos and short-form vertical videos: whichever style template a project imports determines the aspect ratio of everything generated in that project.
- Everything else — YouTube Title/Description/Tags Prompt, YouTube Thumbnail Prompt, `description`, `scene_density`, and two optional fields, **Best For** (a short pick-between-templates hint, e.g. "History, biography, philosophy") and a **Demo Image** (a sample frame previewed on the card) — lives behind an **Advanced Settings** section on the card, pre-filled with sensible generic defaults on create so a user never has to open it unless they want to customize those fields.
- **Generate Style Template** button: user provides a name, description, and the same aspect-ratio choice, and **OpenAI** (`ChatOpenAI` via LangChain, structured output) generates a full style template — `description`, `image_prompt`, `animation_prompt`, and both YouTube packaging prompts — for review before it's accepted and added to the library. The chosen aspect ratio isn't just save-time metadata: it changes what the AI actually writes, via a distinct creative brief per format (long-form gets a sustained-narrative brief; Reels gets an instant-hook, fast-paced brief), so the same name/description produces different prompts depending on which format is selected. Each generated field is capped to the same word limit enforced on manual entry (150/300/200/150/150 words respectively) so an accepted draft is always editable afterward without failing validation. The same shared starter catalog can now be authored in the local `vgai2admin` portal with its own OpenAI draft/demo-image tools; those admin actions use its own API key and never spend a vgAI user's credits.
- **Starter Templates**: a read-only catalog of 12 product-made style templates (Cinematic 3D Animation, Pencil Sketch & Charcoal, Anime Cel-Shaded, and so on), browsable in a big popup opened from a "Starter Templates" button on the page — each shown as a card with an ordered gallery of up to three demo images, badges, a "Best for" hint, and an "Add to Library" button that copies it into the user's own library in one click, ready to edit or delete freely afterward. The primary image and gallery thumbnails open a dedicated gallery viewer with previous/next controls, ←/→ keyboard navigation, a counter, and thumbnails, making the style's range visible before import without reopening the card. Importing the same one twice is allowed and makes two independent copies; later edits to the catalog only affect templates imported after the edit, not ones already in a library. Only the gallery's first-priority image is copied into the user's own Cloudinary folder on import (§9); the other examples are catalog-only, so the user's library card stays focused on one preview and an admin replacing or deleting a catalog entry can never blank an imported preview.
- **Download / Share / Import**: every card in a user's own library has a Download button (saves the template as a `.json` file) and a Share button (hands the same template to the phone/desktop's native share sheet — WhatsApp, Gmail, Bluetooth, whatever's installed). A page-level **Import** button lets anyone paste that file back in — the JSON is strictly validated (required fields, word limits, valid aspect ratio/scene density) before it's added as a brand-new template in the importer's own library, so a friend can hand off a style template without either of you touching the Starter Templates catalog.

### `/liked_projects`

- Shows all project folders the user has liked (liked via the heart control on each project row in the sidebar's Project Folders list — always visible, not a hover-to-reveal control, alongside an always-visible delete button).
- Each project row in the sidebar also shows a yellow folder icon (so the section visually reads as "these are your project folders"), and a hover tooltip with the project's created date. Renaming is double-click-the-name rather than a separate pencil button.
- Shown here as a card grid (`LikedProjectsCard.tsx`) — project name, created date, a thumbnail if the project has generated one (otherwise a folder placeholder), and an unlike button.
- User can unlike a project (from either the sidebar or this page) or click through to open it.
- Like state (`projects.is_liked`) is a single source of truth read by both the sidebar and this page (the shared `ProjectsContext`), so liking/unliking anywhere stays in sync everywhere instantly — no separate fetch, no lag.

### `/generate_script`

1. User fills in a form: `category` (a dropdown of common YouTube content categories — Finance & Investing, News & Current Affairs, Entertainment, Story/Drama, True Crime & Mystery, Motivational & Self-Improvement, History, Technology, Health & Fitness, Educational/How-To, Comedy, Gaming, Travel, Food & Cooking, Science, Horror/Creepy, Business & Entrepreneurship, Relationships & Lifestyle, Sports, Kids & Family — with a free-text "Other" option), `target_country` (a searchable country combobox — type to filter, click or Enter to pick — the audience Perplexity should research trends for), `video_type`/`content_type` (long-form video or YouTube Shorts/Reel), `script_word_length` (a dropdown of 100-word bands from `100-200` up to `1400-1500`), `topic_description`, and `script_description` (max 300 words — a free-form "skill file" the creator uses to tell Claude exactly how they want the script written: tone, structure, must-hit points, etc.).
2. **Get Top 10 Viral Topics** (5 credits) — calls **Perplexity** (via OpenRouter, `perplexity/sonar-pro`) to research the web and return 10 trending/viral topic ideas for the given category, topic description, target country, and video format. Each shows as a card (title + why it's trending) with its own **+ Generate** button — no popup. The first research call of a session creates a `script_templates` row behind the scenes (not yet a "saved template" — see step 6); re-researching under the same session **updates that same row's 10 `researched_topics` in place** rather than creating new ones, so a session always has at most 10 researched topics.
3. Clicking **+ Generate** on a topic card calls **Claude** (via OpenRouter, `anthropic/claude-sonnet-5`) to write a full script matching the `script_description` and chosen word-length band, along with a list of characters involved in the story (name, e.g. "Nick, 30, male", plus profession and a brief physical appearance description) — shown as "None" if the script has no named characters. Cost scales with the word-length band: `words_per_credit = 30` (rounded up to a whole credit), so e.g. a script capped at 900 words costs 30 credits. The result renders as its own numbered card ("Script #1", "Script #2", ... numbered from the earliest generated) showing topic, script, word count, and character list — also not a popup, and every generated-script card **persists in the database** and stays visible (across page reloads and across different research sessions) until the user deletes it. A user can also **edit** a card's topic/script text directly (no AI call, no credit cost); the editable Topic Description field has a visible, server-enforced 300-word maximum.

`vgai2admin/migration/006_generated_script_topic_word_limit.sql` has been applied manually in the shared Supabase SQL Editor. It changes `generated_scripts.topic_name` from 300 characters to `text`, allowing the documented 300-word maximum.
4. **Import** — creates a **new** project folder pre-filled with that script and navigates to `/project_folder/{project_id}` to start working on it. Always a new project; there's no "import into an existing one" picker.
5. **Improvise** — opens a feedback popup; the given feedback + the current script are sent back to Claude, which returns a revised script that replaces the same card in place (same word-length-based credit cost). Can be repeated as many times as the user likes.
6. The form inputs (`category`, `topic_description`, `script_description`, `target_country`, `video_type`, `script_word_length`) can be saved as a reusable **script template** for later — this flips the session's `script_templates` row to `is_saved = true` (or creates one if the user never researched first) rather than creating a duplicate row. A "My Templates" popup lists only the user's explicitly-saved templates (auto-created research-session rows don't clutter this list) so they can be imported back into the form — which also restores that session's researched topics — without retyping everything. Deleting a saved template also deletes its researched topics and generated scripts.

### `/profile`

- Shows `name`, `email`, and `current_credit_balance`.
- Tabbed view:
  - **Payment History** — every top-up from `credit_topups`: date, amount paid, credits added, and `payment_status`.
  - **Usage History** — every project's spend, sourced from `project_expence_tracker` (kept even after project deletion). Hovering a project shows its `llm_credit_spent`, `image_credit_spent`, `animation_credit_spent`, and `voiceover_credit_spent`. The page also totals across everything: `total_credit_spent`, `total_llm_credit_spent`, `total_image_credit_spent`, `total_animation_credit_spent`, `total_voiceover_credit_spent`, and `total_miscellaneous_credit_spent` (script/character-sheet/style-template generation).

### `/project_folder/{project_id}`

The core workspace. Here the user:

- Pastes/edits the `script`, up to 4,000 words. The live editor states how many words must be removed when the limit is exceeded; over-limit scripts are not autosaved or accepted by the backend.
- Imports **characters** from `/characters` (saved as `project_characters` — a **snapshot**, so later edits to the global character don't retroactively change this project). Each imported character can also be viewed and edited *for this project only* — a project-specific tweak (a detail changed for this story, a different reference image) never touches the original in `/characters` or any other project that imported the same character. This snapshot is still visible and editable even if the original character is later deleted from `/characters` entirely.
- Imports a **style template** from `/style_templates` (also snapshotted onto the project — `snapshot_styletemplate_*` fields — so future edits to the global template don't affect existing projects). The applied template can likewise be viewed and edited for this project only, and stays fully visible and editable even after the original is deleted from `/style_templates` — the project keeps its own independent copy regardless of what happens to the library.
- Configures ElevenLabs voiceover settings (`vo_voice_id`, `vo_model_id`, `vo_stability`, `vo_similarity`, `vo_style`, `vo_speaker_boost`, `vo_speed`).
- Chooses which LLM / image / animation models to use for this project. The video-metadata thumbnail preview follows the applied style template's video ratio: 9:16 for Reels and 16:9 otherwise; portrait previews use the same compact width cap as scene-card media.

#### Automatic scene generation

Clicking **Generate Scenes (Automatic)** sends the script + the imported style template prompts + character sheets to an LLM, which splits the script into scenes. Base costs `ceil(script_word_count / 100)` credits; Pro costs exactly three times the Base credit total. The user sees an estimate while generation runs: Base allows about 30 seconds per 1,000 words (30 seconds minimum), and Pro allows twice that time. Each resulting scene includes `scene_text`, `scene_image_prompt`, `scene_animation_prompt`, and (once generated) `generated_image_url` / `generated_animation_url`. Scenes render as **scene cards** where the user can:

- Generate the scene's image (**OpenAI**, driven by `scene_image_prompt`) — see **Bulk scene image generation** below to generate every remaining scene's image at once instead of one at a time.
- Generate the scene's animation (driven by the generated image + `scene_animation_prompt`).
- Upload or drag-and-drop an image/animation produced outside vgAI straight onto the card — free, no credits — so a scene worked on manually (e.g. generated by hand on meta.ai) still ends up organized in the project. Uploading over an existing asset warns first that the current one is being permanently deleted; a delete button on each asset removes it outright.
- Edit scene text/prompts, add, delete, or reorder cards.
- Track async status per asset via `image_status` / `animation_status` (`pending → generating → completed/failed`).

Re-splitting a project's scenes — via either method below — replaces the previous batch outright: every existing scene's `generated_image_url`/`generated_animation_url` is deleted, and so is the project's YouTube thumbnail (`thumbnail_image_url`), since it was generated for the previous batch's `thumbnail_prompt` and is now just as stale. This applies whether the re-split comes from an edited script or just a different roll of the dice on the same one — there's no reliable way to match old scenes to new ones and decide which assets "still count," so all of them go rather than leaving orphaned media behind.

#### Cancelling a generation

Every scene card's **Cancel** button (image or animation) discards that generation's result. It does **not** refund the credits — those were reserved when the user clicked Generate, and the provider bills vgAI whether or not anyone waits for the answer (see §2).

What Cancel guarantees is that the abandoned asset never shows up. Each generation stamps a `*_generation_token` on the row, and the write-back at the end only lands if that token is still current; cancelling clears it, and so does starting a new generation. This matters for the normal reason people cancel — they started by mistake, tweak the prompt, and generate again. Without the token, the first (slow) request would finish afterwards and overwrite the newer, wanted result. Instead it finds its token gone, deletes the image/video it just uploaded, and returns without touching the scene.

Animation additionally stops polling the moment the user disconnects, so vgAI isn't waiting on a clip nobody wants — but the job was already submitted and billed, which is exactly why cancelling isn't a refund.

#### Regenerating an image

Clicking **Regenerate** on a scene that already has an image doesn't resubmit the same prompt that just produced a result the user didn't like — an LLM first rewrites both the image prompt and the animation prompt (told the previous result was disliked, told to vary the composition/action while strictly keeping the established art style, technique, and camera/motion rules), and only then generates the new image from the rewritten prompt. This costs a flat 1 credit for the rewrite on top of the normal per-tier image-generation cost. Separately, hand-editing just the image prompt (without clicking Regenerate) offers — via a confirmation popup, not automatically — to rewrite the animation prompt to match it, also for 1 credit; declining leaves the animation prompt as-is.

#### Manual scene generation

`GenerateScenesManualPopUp.tsx` asks Gemini for one valid JSON object and safely corrects only clear unescaped quotation marks inside narration before the free parse/persist request. If Gemini accidentally repeats a complete response, the popup uses the first response and tells the user. It deliberately avoids generic JSON-repair libraries because they can silently truncate narration; the backend remains the schema authority.

Clicking **Generate Scenes (Manual)** charges `ceil(script_word_count / 200)` credits up front and then opens a popup with a ready-to-copy prompt (script + scene-splitting instructions + involved characters, phrased so Gemini's response comes back in the same structured shape the automatic flow produces). The user pastes this into `gemini.google.com`, selects a Gemini Pro model, copies back the full JSON response, pastes it into the popup, and clicks **Generate**. If characters are in use, the popup prominently tells the user to copy each character sheet image and paste it into the same Gemini chat before running the prompt.

**The charge lands on the button click, not on the paste-back**, mirroring "Generate All Images (Manual)" below. What this flow actually sells is the prompt itself — once the popup reveals it, the user has everything they need to run the split on gemini.google.com and generate images and animations elsewhere, and nothing obliges them to ever paste a result back. Billing at the paste-back step would make the whole feature optional to pay for. Charging on open also means the paste-back is free, including retries: a malformed or truncated response can be fixed and re-submitted as many times as needed without paying twice.

No AI provider is billed on this path — the "AI" work happened for free in the user's own Gemini session — which is why Manual is 2x cheaper per word than Automatic Base and 6x cheaper than Automatic Pro, even though credits are still reserved (parsing and persisting the pasted response is still real backend work). This populates the exact same scene fields as the automatic flow — everything downstream (image/animation generation, cards, etc.) works identically either way.

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

#### Bulk scene image generation

Two buttons above the scene grid generate every remaining scene's image at once, instead of clicking **Generate** on each card individually:

- **Generate All Images (Automatic)** — calls the same OpenAI-backed endpoint as an individual scene card's Generate button, but for every scene still missing `generated_image_url`. To avoid tripping OpenAI's rate limits it runs 5 images concurrently at a time, pausing 10 seconds between batches of 5 (60 seconds every 50th image). The button's credit estimate (`remaining scenes × cost per image` for the project's image tier) updates live as scenes complete, and a progress bar during the run is seeded from the project's already-generated count — not from zero — plus the current batch number and a countdown during any pause. **Stop** aborts every image currently generating rather than letting the run finish in the background; credits already reserved for those are not refunded (§2's reserve-first model still applies). Five consecutive failures stops the run automatically and reports every error collected so far.
- **Generate All Images (Manual)** — the free counterpart, mirroring "Generate Scenes (Manual)" above: no AI provider is called. Clicking the button charges `ceil(scene_count / 5)` credits up front, then opens a popup with click-to-copy character sheet images and batched scene-prompt text (selectable batch size — 5, 10, or 20 scenes) ready to paste into meta.ai. There's no paste-back step here — unlike a manual scene split there's no structured text response to parse, so the generated images are downloaded and used outside vgAI.

Both buttons draw from the same 5-slot concurrency limit as each scene card's own Generate button — a 6th concurrent image generation started anywhere on the page is rejected with a warning instead of silently queued.

#### Download All

A button above the scene grid downloads everything the project has generated so far — every scene image, every scene animation, and the video thumbnail — in one action, with a live progress bar (files saved / total, the filenames currently downloading, a Stop button). Nothing here is billed; these are just fetches of assets already sitting in Cloudinary. Only present once the project has scenes; disabled with an explanatory tooltip if nothing has actually been generated yet, so clicking it never opens an empty folder picker.

Where the browser supports the **File System Access API** (Chrome, Edge), clicking it opens the OS's own folder picker, and the files are written straight into whatever folder is chosen:

```
<chosen folder>/
  thumbnail.<ext>              # only if a thumbnail has been generated
  images/scene_01.<ext> ...    # every scene with a generated_image_url
  animation/scene_01.<ext> ... # every scene with a generated_animation_url
```

Scene numbers are zero-padded to the project's own scene count (`scene_01`, not `scene_1`, once there are 10+ scenes) so a file browser sorts them in the right order. In a browser without that API (Firefox, Safari), the same structure is built as a single `.zip` and downloaded normally instead — the button's tooltip says so, and names the browsers that get the real folder picker.

**Voiceover is deliberately absent from this**, matching the rest of this page: nothing generates `project_voiceovers` rows yet (see below), so there is nothing to add to a `voiceover/` folder today. The download code is written so that once voiceover generation ships, adding those files is a small, additive change — not a restructuring.

#### Voiceover generation — *(Not built yet)*

Clicking **Generate Voiceover** sends the script to **ElevenLabs**. Since ElevenLabs can only process ~5,000 characters per request, the backend automatically chunks the script into pieces and generates a voiceover per chunk (`project_voiceovers`, ordered by `voiceover_number`). The user can preview each chunk, and clicking **Stitch Audio** uses **FFmpeg** to merge all chunks into a single master audio file.

This is still the intended spec, not the current behavior — the button is disabled ("Coming soon") and the backend route (`app/routes/project/voiceovertts.py`) exists but isn't registered in `router.py`. See the Download All note just above for how this connects once it lands.

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
  - **OpenAI API** — text and structured output through LangChain `ChatOpenAI` (`gpt-6-luna` for Base and `gpt-6-sol` for Pro scene splitting), plus image creation/editing through OpenAI's image API (`gpt-image-2.5-flare` for Base and `gpt-image-2.5-sunburst` for Pro).
  - **No provider at all** — manual scene splitting (see §5) doesn't call any AI API; it validates and persists the JSON the user pastes back from their own Gemini session, which is exactly why it's priced far below the automatic flow.
  - **OpenRouter** — gateway for **Perplexity** (viral topic research), **Claude** (script generation & "improvise" regeneration), and image-to-video **animation** (`alibaba/wan-2.6` on `"base"`, `google/veo-3.1-lite` on `"pro"`, via its long-running video-job API).
  - **ElevenLabs API** — chunked text-to-speech voiceover generation, kept independent of OpenRouter for dedicated TTS quality control. *(Voice settings are saved; generation itself is not built yet.)*
  - **FFmpeg** — stitching voiceover chunks into a single audio file. *(Not built yet.)*
- **Payments:** Razorpay — credit top-ups via Checkout (order creation + signature verification), INR-only for now. The order amount is computed **per credit, not per dollar**: 1 credit = ₹1 (`PAISE_PER_CREDIT = 100`), so a $5 top-up is 500 credits billed as ₹500. The Add Credits popup's charge preview runs that same per-credit formula so it always equals what Razorpay's modal shows — deriving it from the USD figure at a separate FX rate is what previously made the two disagree.

  > **Open question:** the UI collects USD but bills INR at a rate well above market, which reads as a bad conversion rather than as deliberate regional pricing. Standardizing on USD is the likely direction — most users aren't in India and every provider bill (OpenAI, OpenRouter, Cloudinary, ElevenLabs) is already in dollars, so USD pricing takes FX risk out of the margin entirely. It's gated on Razorpay international payments being approved on the account, needs a workable minimum charge (today's `MIN_CREDITS = 10` would become an unprocessable $0.10), and would leave `credit_topups` holding genuinely mixed currencies — at which point `/payments/history`'s single `total_amount_paid` sum stops being meaningful. Not decided yet.

> **Note:** this document is the product *spec* — intended behavior. `AGENTS.md` is the record of what is actually implemented, and is the one to trust where the two disagree. The model inventory below is the current implementation.

### All AI model mapping

**Text and structured output**

- `gpt-6-luna` — OpenAI through LangChain `ChatOpenAI`; Base automatic scene splitting uses `medium` reasoning effort, while character-prompt drafts, style-template drafts, and image/animation-prompt rewriting during scene regeneration use `low`.
- `gpt-6-sol` — OpenAI through LangChain `ChatOpenAI`; Pro automatic scene splitting. Reasoning effort is explicitly configured as `medium`.
- `perplexity/sonar-pro` — Perplexity through OpenRouter; viral-topic research.
- `anthropic/claude-sonnet-5` — Anthropic Claude through OpenRouter; full script generation and feedback-driven “Improvise” rewrites.

**Image generation**

- `gpt-image-2.5-flare` — OpenAI Images API; Base scene images and thumbnails, Base character sheets, and all style-template demo images (`quality="low"`).
- `gpt-image-2.5-sunburst` — OpenAI Images API; Pro scene images and thumbnails, and Pro character sheets (`quality="high"`).
- Base and Pro image-generation credit prices remain 4 and 20 credits respectively.

**Image-to-video animation**

- `alibaba/wan-2.6` — OpenRouter Video API; Base animation generation.
- `google/veo-3.1-lite` — OpenRouter Video API; Pro animation generation.

**Configured, but not yet called**

- `eleven_multilingual_v2`, `eleven_flash_v2_5`, and `eleven_turbo_v2_5` — ElevenLabs voice options saved in project settings. Voiceover generation is still intentionally unwired, so none of these models is called yet.

**Manual workflows**

- Manual scene splitting does not call a vgAI model: the creator runs the copied prompt in Gemini at gemini.google.com using a Gemini Pro model, then pastes the JSON result back.
- Manual image generation does not call a vgAI model: the creator uses the copied prompts with their own Meta AI session.

---

## 7. Database Schema (DBML)

The full, current schema lives in [`vgaidatabase.dbml`](./vgaidatabase.dbml), with runnable DDL in [`vgaidatabase.sql`](./vgaidatabase.sql) — the **sole canonical SQL snapshot** for the shared vgAI/vgai2admin Supabase database. The admin repository deliberately has no duplicate `vgaidatabase.sql`; an admin-side migration must update both canonical files here. The SQL also defines the `spend_credits` / `refund_credits` / `add_project_expense` functions the credit system depends on. An existing database is brought up to date with [`migration/vgaidatabase_migration_credits.sql`](./migration/vgaidatabase_migration_credits.sql); until that's applied, every credit-spending endpoint fails.

Migrations are run **by hand** in the Supabase SQL Editor — neither backend can execute DDL, since both hold the Supabase REST service-role key rather than a Postgres connection string. `migration/` here holds vgAI's own two (both already applied); the tables added for the sibling admin portal (`access_control_list`, `access_system_settings`, `admin_credit_grants`, `default_style_templates`, `default_characters`, `contact_submissions`, `user_access_requests`) live in **`vgai2admin/migration/`**, which is the primary home for any new schema change against this one shared database.

Summary of tables:

- **`users`** — profile, `current_credit_balance`, `miscellaneous_credit_spent`.
- **`admin_credit_grants`** — support grants and the one-time 20-credit `welcome` bonus, each with a balance-after audit value; neither is a purchase.
- **`project_expence_tracker`** — historical per-project credit spend (`llm_credit_spent`, `image_credit_spent`, `animation_credit_spent`, `voiceover_credit_spent`), snapshotted by `project_id`/`project_name` so it survives project deletion. One row per project, uniquely indexed on `project_id`.
- **`projects`** — script, `is_liked`, selected model ids, a full snapshot of the style template used, YouTube metadata, and ElevenLabs voice settings.
- **`style_templates`** — reusable visual styles: image/animation/YouTube prompts, `scene_density`, `image_aspect_ratio`, `video_aspect_ratio`, `is_default`.
- **`characters`** — reusable character library with `character_sheet_url` and `is_default`.
- **`script_templates`** — script-generation requests: `category`, `topic_description`, `script_description`, `content_type` (`long_videos` / `short_videos`), `target_country`, `script_word_length`, `is_saved` (false = auto-created behind a research/generate session the user hasn't explicitly saved; true = an explicit "Save as Template").
- **`researched_topics`** — up to 10 rows per `script_templates` row (`topic_number` 1-10, unique together), holding the current `topic_name`/`brief_description` from the last "Get Top 10 Viral Topics" call; re-researching updates these in place.
- **`generated_scripts`** — every script a user has generated (`topic_name`, `script_text`, `character_involved`), scoped to a `script_templates` row but *not* foreign-keyed to `researched_topics`, so a script survives even after its originating topic batch is replaced by a later research call.
- **`project_characters`** — per-project snapshot of imported characters.
- **`scenes`** — per-project scene breakdown: text, image/animation prompts, generated URLs, generation status enums, and the `*_generation_token` columns that let a cancelled generation's result be discarded instead of saved.
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
  is_hidden boolean [not null, default: false]

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
  snapshot_styletemplate_image_aspect_ratio text
  snapshot_styletemplate_video_aspect_ratio text
  snapshot_styletemplate_scene_density scene_density

  // YouTube Metadata
  thumbnail_prompt text
  thumbnail_image_url text

  // See scenes.image_generation_token.
  thumbnail_generation_token uuid

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
  target_country varchar(200) [not null]
  script_word_length varchar(20) [not null]

  // false = auto-created behind a "Get Top 10 Viral Topics" / generate call the
  // user never explicitly saved; true = user clicked "Save as Template". The
  // "My Templates" list only shows is_saved = true rows.
  is_saved boolean [not null, default: false]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]
}

Table researched_topics {
  id uuid [pk, default: `gen_random_uuid()`]

  script_template_id uuid [not null]
  user_id uuid [not null]

  // 1-10, one slot per topic in a "Get Top 10 Viral Topics" batch. Re-researching
  // the same script_template updates these 10 rows in place rather than creating
  // new ones, so a template always has at most 10 researched_topics rows.
  topic_number int [not null]

  topic_name varchar(300) [not null]
  brief_description text [not null]

  created_at timestamp [not null, default: `now()`]
  updated_at timestamp [not null, default: `now()`]

  indexes {
    (script_template_id, topic_number) [unique]
  }
}

Table generated_scripts {
  id uuid [pk, default: `gen_random_uuid()`]

  script_template_id uuid [not null]
  user_id uuid [not null]

  // Denormalized, not a FK to researched_topics -- a script must survive even
  // after its originating topic batch gets replaced by a later research call.
  topic_name varchar(300) [not null]
  script_text text [not null]

  // Characters involved, serialized as delimited text (characters joined by
  // "|||", each character's fields joined by "::") and parsed back into
  // structured objects by the backend on read.
  character_involved text

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

  // Stamped with a fresh uuid when a generation starts. The write-back at the end
  // is guarded on the token still matching, so a generation the user cancelled --
  // or one superseded by a later click after editing the prompt -- can never land
  // its stale image/animation on top of the newer one.
  image_generation_token uuid
  animation_generation_token uuid

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

Ref: researched_topics.script_template_id > script_templates.id
Ref: researched_topics.user_id > users.id
Ref: generated_scripts.script_template_id > script_templates.id
Ref: generated_scripts.user_id > users.id

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
  default_style_templates/       # demo frames for the starter style-template catalog (product-wide)
  default_characters/            # character sheets for the starter character catalog (product-wide)
  contacts/                      # screenshots attached to /contact submissions (product-wide)
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
- The three product-wide folders (`default_style_templates/`, `default_characters/`, `contacts/`) sit at the root rather than under a `<user_id>`. For the two catalogs that's because a starter asset belongs to the product, not to any one user; for `contacts/` it's because the contact form is usable **signed-out**, so there may be no `<user_id>` folder to write into at all. Both are written **only** from the vgai2admin portal (`/defaultstyletemplate` and `/defaultcharacter`), never by vgAI itself. Each catalog's delete path only removes an asset that is actually inside its own folder, so an entry whose URL was pasted in from elsewhere is left alone — see `_owns_demo_image()` / `_owns_character_sheet()` in vgai2admin's routers.
- `upload_image()` (`backend/app/cloudinary.py`) takes a `folder` argument that is the path *under* the root — e.g. `f"{user_id}/characters"` or `f"{user_id}/{project_id}/scene_images"`. Callers build that path; the helper just prefixes the root folder and picks a unique `public_id`.
- `delete_media()` (same file) is the matching per-asset cleanup: it parses the `public_id` back out of a stored `secure_url` and deletes that asset from Cloudinary. Every place that removes or replaces a media-bearing row uses it — deleting a character, deleting a scene (image + animation), and regenerating a scene's image, a scene's animation, or the project thumbnail (the *previous* asset is deleted once the new one is successfully saved, never on a cancelled/failed attempt).
- `delete_project_media()` is the project-wide version: deleting a project deletes every image/video resource under its `<user_id>/<project_id>/` prefix — not just what's tracked on scene/thumbnail rows, so a stray upload from a cancelled generation doesn't linger either — and then removes the now-empty subfolders and the project folder itself.
- **Current state**: `<user_id>/characters/`, `<user_id>/<project_id>/{scene_images,scene_animation,thumbnail_image}/`, and `<user_id>/<project_id>/project_characters/` are all wired up. Importing a character (explicit import or the default-character auto-import on project creation) makes a real server-side copy of the character-sheet image into the project's own `project_characters/` folder (`app/cloudinary.py`'s `copy_image_from_url()`, called from `projectcrud.py`) rather than reusing the library character's `characters/` URL — so deleting or replacing a library character can never affect a project that already imported it, and deleting the project cleans up its character copies too, by the same `<user_id>/<project_id>/` prefix delete as everything else. Every `project_characters` row in the DB was confirmed to already be on this per-project-copy scheme as of the fix (a one-time backfill script migrated the one pre-fix row that existed, then was deleted — see `_owns_project_character_image()` in `projectcrud.py`, whose guard is kept in place regardless in case a restored backup or another environment ever reintroduces an old-style row). `voiceovers/` is not wired up — voiceover generation is still a stub.
- **Both starter-catalog imports copy the image, never reference it.** `POST /characters/defaults/{slug}/import` and `POST /styletemplates/defaults/{slug}/import` each run `copy_image_from_url()` to pull the catalog's asset out of its root-level folder and into the importer's own `<user_id>/characters/` or `<user_id>/style_templates/` folder, so every imported row owns an independent asset. That is what makes deleting a catalog entry safe: a copied URL string would leave every importer pointing at the catalog's asset, and removing the entry (which deletes it) would blank the image for all of them — the exact bug `project_characters` had. The style-template half was added later, after the same reasoning was applied to characters; a one-time backfill converted the two existing rows that still shared a catalog URL, and `_owns_demo_image()`/`_owns_character_sheet()` remain as guards for a pasted external URL or a row restored from an old backup.

---

## 10. Deployment

### Payment support IDs

Profile → Payment History displays a copyable Razorpay payment ID for each completed top-up and, when Razorpay supplied one, a failed attempt. Customers can send that reference to `hello@vgai2.com` when they need payment support. Pending attempts and failed attempts without a payment ID show no reference. Razorpay signatures remain server-side and are available only in the local vgai2admin payment lookup.

**Currently deployed.** The production site runs on an AWS EC2 instance as four Docker containers behind nginx with a Let's Encrypt certificate. The runbook also documents migration to a new AWS account while retaining the existing Supabase and Cloudinary projects.

[`DOCKERHUB_DEPLOY.md`](./DOCKERHUB_DEPLOY.md) is the end-to-end runbook — instance sizing, security group, DNS, certificate issuance, build/start, the post-deploy dashboard changes, day-2 operations, and the failures that actually happen. Read it rather than reconstructing the setup from the config files.

The shape, since everything else follows from it:

```
                Internet
             :80 │ :443          ← the only ports open on the instance
                 ▼
              nginx              TLS termination + reverse proxy
          /api/* │ │ everything else
                 ▼ ▼
           backend   frontend    FastAPI :8000 / Next.js :3000  (internal only)
           certbot                renews the certificate silently
```

- **One origin.** `https://<domain>/` is the frontend, `https://<domain>/api/...` is the backend, with nginx stripping the `/api` prefix so FastAPI still sees `/users/me` exactly as it does locally. The frontend therefore calls the backend at the **relative** path `/api`, and no domain name is ever compiled into the JavaScript bundle.
- **The domain is written once**, as `DOMAIN` in the root `.env` — nginx renders it into `server_name` and the certificate paths, and the backend's `ALLOWED_ORIGINS` is derived from it. Changing domains needs no frontend rebuild.
- **Only nginx publishes ports.** The backend and frontend use `expose`, so 3000/8000 are reachable only on the internal Docker network and must never be opened in the security group.
- **Nothing to provision for data** — Supabase and Cloudinary are already hosted, and the deployment points at the same shared project, so the schema and every existing asset are live the moment the containers start.
- **The deployment env file is the root [`.env.example`](./.env.example) → `.env`**, separate from `backend/.env` and `frontendweb/.env.local`, which local development still uses unchanged. `NEXT_PUBLIC_*` values are baked into the browser bundle at **build** time, so changing one needs a local frontend image rebuild and Docker Hub push, not a restart.
- After going live, update Supabase redirect URLs, add `vgai2.com` to Razorpay's authorised Checkout domains, and configure the required Razorpay Live webhook at `https://vgai2.com/api/payments/webhook`. Before enabling that webhook, run `vgai2admin/migration/004_atomic_razorpay_credit_settlement.sql` manually in Supabase; it makes webhook reconciliation and browser checkout verification atomic and prevents duplicate credit grants.

[`QUICK_DEPLOYMENT.md`](./QUICK_DEPLOYMENT.md) is the repeatable Windows-to-EC2 update guide: commit, build and push only the changed Docker image(s), then pull/restart them on the live host. First deployment and migration to a new AWS account are covered in `DOCKERHUB_DEPLOY.md`. Keep `nginx/templates/default.conf.template`; Compose requires it for HTTPS and routing.

## Starter style-template demo gallery

The shared `default_style_templates.demo_image_urls` column stores up to three display-ordered examples for each starter style. The Starter Templates popup shows the primary frame plus gallery thumbnails; clicking either opens `MultipleImageViewCardPopUp`, where previous/next buttons, ←/→ keys, thumbnails, and a counter make the whole gallery browsable without returning to the card. Catalog editing and three-concurrent-request AI generation happen only in `vgai2admin`; its prompts divide the examples into single-subject, multi-subject, and environment-led scenes to show genuine range within the same style. On import, only image #1 is copied into the user's own `style_templates.demo_image_url`; the extra two examples stay catalog-only, keeping the library card compact and independently owned.
<!-- Image preview behavior, updated September 2026 -->
Single-image previews in both apps use `ImageZoomPopUp` with direct image URLs (`unoptimized`) so already-cached originals can be reused. Loading is tracked by URL and checked against the mounted image's completion state; reopening does not force a loading reset. The viewer supports pinch/scroll/double-tap zoom, dragging, +/−/0 keyboard controls, a bottom toolbar, an image title and scale indicator, focus containment/restoration, and a retryable error state. Starter style galleries continue using `MultipleImageViewCardPopUp` for previous/next navigation. A first uncached image still requires a network download.
