# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**vgAI** is an AI video-production SaaS: creators paste a script, split it into scenes, and generate matching images/animations/voiceovers per scene, reusing saved character and style-template libraries. Full product spec (all pages, features, and the credit system) is in [`README.md`](./README.md) — read it before implementing any feature, it's the source of truth for intended behavior. The full DB schema is in [`vgaidatabase.dbml`](./vgaidatabase.dbml).

**Current state: early build, not just scaffold anymore.** Auth (Supabase Google OAuth, an inline `LoginModal` gating write actions rather than a forced login redirect) and two full CRUD library features are implemented end-to-end, backend route + Pydantic schema + frontend page/card/edit-popup: **Characters** (`/characters`) and **Style Templates** (`/style_templates`). Navbar and Sidebar are real chrome (not placeholders — see Frontend architecture below). Everything else described in `README.md`/`vgaidatabase.dbml` — projects, scene generation, script generation, liked projects, profile/billing — is still unbuilt; those pages exist only as "coming soon" stubs. The home page (`/`) also still has leftover demo-popup buttons (Interactive Components section) from the original template — not a real feature, safe to delete when that section of the app gets built. Don't assume a feature exists in code just because it's documented in `README.md`; check the actual route/component first.

## Repo layout

- `backend/` — FastAPI + uv Python backend
- `frontendweb/` — Next.js (App Router) + Tailwind frontend
- `vgaidatabase.dbml` — canonical database schema (Postgres/Supabase)
- `README.md` — full product/feature spec, routes, page-by-page behavior
- `dockercommands.md` — docker build/push commands for both images (`mdk7866/vgai-backend`, `mdk7866/vgai-frontend`)

## Commands

### Backend (`backend/`)
```bash
uv sync                        # install dependencies
uv run dev                     # run dev server (uvicorn, reload, port 8000)
uv run ruff check .            # lint
uv run mypy .                  # type check
```
No test suite exists yet in the backend.

### Frontend (`frontendweb/`)
```bash
npm install
npm run dev                    # dev server, port 3000
npm run build
npm run lint                   # eslint (flat config, next/core-web-vitals + next/typescript)
```
No test runner is configured yet in the frontend.

## Backend architecture

- **Routing**: `app/main.py` creates the `FastAPI` app and mounts `app/routes/router.py`'s `api_router`, which aggregates per-resource routers (`app/routes/users.py`, `app/routes/characters/crud.py`, `app/routes/styletemplates/crud.py`). Multi-endpoint resources live in their own subpackage (`app/routes/<resource>/crud.py`) alongside a placeholder `generate<resource>.py` for the future Gemini-backed "Generate with AI" endpoint (see `characters/generatecharacter.py`, `styletemplates/generatetemplate.py` — both still empty). Add new resources the same way, and register the router in `router.py`.
- **Config**: `app/config.py` defines a `pydantic-settings` `Settings` class loaded from `backend/.env`, exposed as a module-level singleton `settings`. `env.example` at the backend root is stale — it references an unrelated prior project's variables (`DATABASE_NAME`, `MAX_BULK_URLS`, `DOWNLOADS_DIR`, `CHATGPT_PAID_API_KEY`) and does not match what the code actually reads.
- **Cloudinary**: `app/cloudinary.py` provides `upload_image()`/`delete_media()` helpers (config fields for cloud name/API key/secret/folder are declared on `Settings`). Assets upload to `<CLOUDINARY_FOLDER_NAME>/<user_id>/<resource>/...`; see `README.md` §9 for the full planned folder layout (only the `characters/` slice is wired up so far — style templates have no image field). `delete_media()` is best-effort (swallows errors) since a Cloudinary asset already gone shouldn't block a DB delete.
- **Supabase**: `app/supabase.py` exports a singleton `supabase` client built with the *secret* (service-role) key — it bypasses Row Level Security, so any per-user access scoping has to be enforced in route code, not assumed from RLS. The `_get_owned_<resource>` helper pattern in `characters/crud.py`/`styletemplates/crud.py` (fetch by id, 404 if missing or `user_id` mismatch) is how that scoping is done — follow it for new resources.
- **Schemas**: request/response models live in `app/schemas/*.py` as plain Pydantic models per resource. `character.py` and `styletemplate.py` are aligned to their DBML tables; other resources are not yet modeled.

## Frontend architecture

- **App Router + client-heavy pages**: routes live under `frontendweb/src/app/`. Existing pages so far use `"use client"` liberally (see `page.tsx`); shared chrome lives in `frontendweb/src/components/`.
- **Layout shell**: `layout.tsx` wraps every page in `ThemeProvider` → `SplashScreen` + `MainLayout`. `MainLayout` renders `Sidebar` + `Navbar` + page content + `Footer`, and owns the mobile sidebar open/close state (sidebar is an off-canvas drawer below `md:`).
- **Theme**: dark mode is a `dark` class on `<html>`, decided pre-hydration by an inline script in `layout.tsx` (reads `localStorage.theme`, falls back to `prefers-color-scheme`) to avoid a flash of the wrong theme. `ThemeProvider` (`components/ThemeProvider.tsx`) mirrors that into React state after mount and exposes `useTheme()`/`toggleTheme()` for interactive toggling; keep both in sync if you touch theme logic.
- **Sidebar/Navbar match the README spec**: `Sidebar.tsx` implements the `README.md` §4 structure — a Library section (Characters, Style Templates, Generate Scripts, Liked Projects) that's always visible/clickable even when logged out, and a Project Folders section that shows a login-gated message instead of the project list when logged out. `Navbar.tsx` has Home/About/Contact (no login required to view) and either an account-avatar menu or a "Login" button depending on auth state.
- **Public browsing, gated actions**: nothing forces a login redirect on page view — `(app)/layout.tsx` renders `MainLayout` regardless of auth state. Write actions (create/edit/delete/generate) call `requireAuth()` from `AuthContext` (`context/AuthContext.tsx`) first; if signed out, it opens the global `LoginModal` (rendered once from root `layout.tsx`) and returns `false` so the caller bails out. Follow this pattern for any new write action rather than redirecting to `/login`.
- **Characters/Style Templates are the reference pattern for new library resources**: each is `types/<resource>.ts` (interface matching the backend schema) + `components/<resource>/<Resource>Card.tsx` (grid card, edit/delete always visible — no hover-to-reveal) + `components/<resource>/Edit<Resource>CardPopUp.tsx` (create/edit form, remounted via a parent-owned `key` prop on open rather than resetting state in a `useEffect`) + `app/(app)/<resource>/page.tsx` (list/create/edit/delete wiring via `lib/api.ts`'s `authFetch`). Style templates additionally show a `Toggle` (`components/Toggle.tsx`) for `is_default` directly on the card, since only one template can be default at a time — see Domain model notes below.
- **All overlay popups portal to `document.body`**: `AlertMessagePopUp`, `ConformationMessagePopUp`, `ImageZoomPopUp`, `LoginModal`, and both `Edit*CardPopUp` components use `createPortal`. Do the same for any new full-viewport overlay — a `position: fixed` element nested under an ancestor with a CSS `transform` (e.g. a card's `hover:-translate-y-0.5`) gets clipped to that ancestor instead of the viewport, since the transformed ancestor becomes its containing block.
- **Important — Next.js version drift**: `frontendweb/CLAUDE.md` (`@AGENTS.md`) warns that this Next.js version has breaking API/convention changes versus training data. Read the relevant guide under `frontendweb/node_modules/next/dist/docs/` before writing or changing any Next.js code in `frontendweb/`.

## Domain model notes (see `vgaidatabase.dbml` for full schema)

- **Credits are the app's currency**: `100 credits = $1`. All AI actions (LLM, image, animation, voiceover, and one-off "miscellaneous" generations like character-sheet/style-template/script generation) are billed in credits against `users.current_credit_balance`.
- **Snapshotting pattern**: when a project imports a character or style template, the data is copied into project-scoped tables/columns (`project_characters`, `projects.snapshot_styletemplate_*`) rather than referenced live — later edits to the library item must not retroactively change existing projects.
- **Spend history survives deletion by design**: `project_expence_tracker` stores `project_id`/`project_name` with no foreign key specifically so a project's credit-spend history remains queryable (for `/profile` usage history) after the project itself is deleted.
- **`is_default` cardinality differs by table**: `characters` has no uniqueness constraint, so a user can mark multiple characters default. `style_templates` has a partial unique index (`idx_user_default_style`, `WHERE is_default = true`) enforcing at most one default per user — the route layer must unset any existing default before setting a new one (see `_clear_existing_default()` in `styletemplates/crud.py`) or the DB write fails.
