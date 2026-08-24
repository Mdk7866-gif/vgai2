-- ---------------------------------------------------------------------------
-- vgAI migration — style_templates: best_for + demo_image_url
-- ---------------------------------------------------------------------------
-- Run this against an EXISTING Supabase database. For a fresh install these
-- two columns are already part of `create table style_templates` in
-- vgaidatabase.sql, so you do not need this file.
--
-- Both columns are nullable with no default and are written only from the
-- "Advanced Settings" section of the Add/Edit Style Template form, so every
-- existing row stays valid as-is and no backfill is required.
--
--   best_for        Short free-text list of the content niches this style
--                   suits, e.g. 'History, biography, philosophy' or
--                   'Rivalries, rise-and-fall'. Shown on the card as a hint
--                   when picking a template. Not sent to any LLM — the
--                   scene-splitting brief lives in `description`.
--
--   demo_image_url  Cloudinary URL of a sample frame rendered in this style,
--                   previewed on the template card so a library of 20 is
--                   scannable visually rather than by prompt text.
--
-- Safe to re-run: `if not exists` makes both statements idempotent.
-- ---------------------------------------------------------------------------

alter table style_templates
  add column if not exists best_for text;

alter table style_templates
  add column if not exists demo_image_url text;
