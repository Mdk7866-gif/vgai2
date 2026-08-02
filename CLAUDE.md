# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**vgAI** is an AI video-production SaaS: creators paste a script, split it into scenes, and generate matching images/animations/voiceovers per scene, reusing saved character and style-template libraries. Full product spec (all pages, features, and the credit system) is in [`README.md`](./README.md) — read it before implementing any feature, it's the source of truth for intended behavior. The full DB schema is in [`vgaidatabase.dbml`](./vgaidatabase.dbml).

**Current state: this is an early scaffold.** The backend routes (`/users`, `/items`) and frontend components (dummy Sidebar nav, demo popups on the home page) are leftover generic template boilerplate — they do not yet implement the domain model described in `README.md`/`vgaidatabase.dbml`. Don't assume a feature exists in code just because it's documented in `README.md`; check the actual route/component first.

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

- **Routing**: `app/main.py` creates the `FastAPI` app and mounts `app/routes/router.py`'s `api_router`, which aggregates per-resource routers (`app/routes/users.py`, `app/routes/items.py`). Add new resources the same way: a router module in `app/routes/`, registered in `router.py`.
- **Config**: `app/config.py` defines a `pydantic-settings` `Settings` class loaded from `backend/.env`, exposed as a module-level singleton `settings`. `env.example` at the backend root is stale — it references an unrelated prior project's variables (`DATABASE_NAME`, `MAX_BULK_URLS`, `DOWNLOADS_DIR`, `CHATGPT_PAID_API_KEY`) and does not match what the code actually reads.
- **Known gap**: `app/cloudinary.py` reads `settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `settings.CLOUDINARY_API_KEY`, `settings.CLOUDINARY_API_SECRET`, `settings.CLOUDINARY_FOLDER_NAME`, but none of these fields are declared on the `Settings` class in `config.py` — this will fail at runtime (`AttributeError`/validation error) until those fields are added.
- **Supabase**: `app/supabase.py` exports a singleton `supabase` client built with the *secret* (service-role) key — it bypasses Row Level Security, so any per-user access scoping has to be enforced in route code, not assumed from RLS.
- **Schemas**: request/response models live in `app/schemas/*.py` as plain Pydantic models per resource (not yet aligned to the DBML tables).

## Frontend architecture

- **App Router + client-heavy pages**: routes live under `frontendweb/src/app/`. Existing pages so far use `"use client"` liberally (see `page.tsx`); shared chrome lives in `frontendweb/src/components/`.
- **Layout shell**: `layout.tsx` wraps every page in `ThemeProvider` → `SplashScreen` + `MainLayout`. `MainLayout` renders `Sidebar` + `Navbar` + page content + `Footer`, and owns the mobile sidebar open/close state (sidebar is an off-canvas drawer below `md:`).
- **Theme**: dark mode is a `dark` class on `<html>`, decided pre-hydration by an inline script in `layout.tsx` (reads `localStorage.theme`, falls back to `prefers-color-scheme`) to avoid a flash of the wrong theme. `ThemeProvider` (`components/ThemeProvider.tsx`) mirrors that into React state after mount and exposes `useTheme()`/`toggleTheme()` for interactive toggling; keep both in sync if you touch theme logic.
- **Sidebar/Navbar are placeholders**: `Sidebar.tsx` currently renders a generic Projects/Scenes/Characters/Generations/Templates menu, not the Library (Characters, Style Templates, Generate Scripts, Liked Projects) + Project Folders structure specified in `README.md` §4. Rebuild it against the README spec rather than extending the placeholder items.
- **Important — Next.js version drift**: `frontendweb/CLAUDE.md` (`@AGENTS.md`) warns that this Next.js version has breaking API/convention changes versus training data. Read the relevant guide under `frontendweb/node_modules/next/dist/docs/` before writing or changing any Next.js code in `frontendweb/`.

## Domain model notes (see `vgaidatabase.dbml` for full schema)

- **Credits are the app's currency**: `100 credits = $1`. All AI actions (LLM, image, animation, voiceover, and one-off "miscellaneous" generations like character-sheet/style-template/script generation) are billed in credits against `users.current_credit_balance`.
- **Snapshotting pattern**: when a project imports a character or style template, the data is copied into project-scoped tables/columns (`project_characters`, `projects.snapshot_styletemplate_*`) rather than referenced live — later edits to the library item must not retroactively change existing projects.
- **Spend history survives deletion by design**: `project_expence_tracker` stores `project_id`/`project_name` with no foreign key specifically so a project's credit-spend history remains queryable (for `/profile` usage history) after the project itself is deleted.
