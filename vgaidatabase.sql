-- ======================================
-- vgAI Database Schema
-- Generated from vgaidatabase.dbml
-- Run this in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run)
-- ======================================

create extension if not exists "pgcrypto";

-- ==========================
-- Enums
-- ==========================

create type scene_density as enum ('small', 'medium', 'high');
create type generation_status as enum ('pending', 'generating', 'completed', 'failed');
create type payment_status as enum ('pending', 'success', 'failed', 'refunded');
create type content_type as enum ('long_videos', 'short_videos');

-- Used by the vgai2admin portal's access control (see the access_control_list /
-- access_system_settings tables below). Enforced by *this* app's backend on
-- every authenticated request, not only at login.
create type access_list_type as enum ('allowed', 'restricted');
create type access_system_mode as enum ('allowed_all', 'allowed_only');

-- ==========================
-- Tables
-- ==========================

-- users.id is the Supabase Auth user id (Google login is the only sign-up
-- path), so it references auth.users directly instead of generating its own.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,

  name varchar(200),
  email varchar(255) not null unique,
  profile_image_url text,

  current_credit_balance numeric not null default 0,
  miscellaneous_credit_spent numeric not null default 0,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table project_expence_tracker (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  -- No FK to projects on purpose: spend history must survive project deletion.
  project_id uuid not null,
  project_name varchar(200) not null,

  llm_credit_spent numeric not null default 0,
  image_credit_spent numeric not null default 0,
  animation_credit_spent numeric not null default 0,
  voiceover_credit_spent numeric not null default 0,

  -- Per-project counterpart to users.miscellaneous_credit_spent. The two are
  -- disjoint by convention, not by constraint: a project-scoped miscellaneous
  -- spend books here (add_project_expense(..., 'miscellaneous', ...)) with
  -- spend_credits(..., p_track_miscellaneous => false), a non-project one does
  -- the reverse. Counting a spend in both would double it in /profile's totals.
  miscellaneous_credit_spent numeric not null default 0,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  name varchar(200) not null,
  script text,

  is_liked boolean not null default false,
  -- A per-user organizational preference. Hidden projects remain intact and
  -- can be restored from the sidebar's collapsed Hidden Projects section.
  is_hidden boolean not null default false,

  llm_model_id varchar(200),
  image_model_id varchar(200),
  animation_model_id varchar(200),

  snapshot_styletemplate_name varchar(200),
  snapshot_styletemplate_image_prompt text,
  snapshot_styletemplate_animation_prompt text,
  snapshot_styletemplate_youtube_title_description_tags_prompt text,
  snapshot_styletemplate_youtube_thumbnail_image_prompt text,
  snapshot_styletemplate_description text,
  snapshot_styletemplate_image_aspect_ratio text,
  snapshot_styletemplate_video_aspect_ratio text,
  snapshot_styletemplate_scene_density scene_density,

  thumbnail_prompt text,
  thumbnail_image_url text,

  -- See scenes.image_generation_token below.
  thumbnail_generation_token uuid,

  title_of_video text,
  description_of_video text,
  tags_of_video text,

  vo_voice_id text default '95etAma035P6Ys5iv7Oo',
  vo_model_id text default 'eleven_multilingual_v2',
  vo_stability numeric default 40,
  vo_similarity numeric default 70,
  vo_style numeric default 30,
  vo_speaker_boost boolean default true,
  vo_speed numeric default 0.88,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- If projects already exists in your Supabase project from before the 3
-- style-template aspect-ratio/scene-density snapshot columns were added, run
-- this instead of the create table above (it will fail on an existing table):
--   alter table projects add column snapshot_styletemplate_image_aspect_ratio text;
--   alter table projects add column snapshot_styletemplate_video_aspect_ratio text;
--   alter table projects add column snapshot_styletemplate_scene_density scene_density;
--   alter table projects add column is_hidden boolean not null default false;

create table style_templates (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  name varchar(200) not null,
  is_default boolean not null default false,

  image_prompt text not null,
  animation_prompt text not null,
  youtube_title_description_tags_prompt text,
  youtube_thumbnail_image_prompt text,

  scene_density scene_density not null default 'small',
  image_aspect_ratio text not null,
  video_aspect_ratio text not null,
  description text not null,

  -- Both optional, set from the form's Advanced Settings section.
  -- best_for: content niches this style suits, e.g. 'History, biography,
  -- philosophy'. User-facing only — the scene-splitting brief is in description.
  -- demo_image_url: Cloudinary sample frame, previewed on the template card so
  -- a large library is scannable visually rather than by prompt text.
  best_for text,
  demo_image_url text,
  -- Ordered catalog gallery (maximum three). The first URL remains in
  -- demo_image_url and is the sole preview copied when a user imports.
  demo_image_urls jsonb not null default '[]'::jsonb,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- If style_templates already exists in your Supabase project from before
-- best_for / demo_image_url were added, run vgaidatabase_migration_styletemplate_extras.sql
-- instead of the create table above (it will fail on an existing table).

-- Partial index: only one default style template per user.
create unique index idx_user_default_style
  on style_templates (user_id)
  where is_default = true;

create table characters (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,
  is_default boolean not null default false,

  name varchar(200) not null,
  description text not null,
  character_sheet_url text not null,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table script_templates (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  category varchar(200) not null,
  topic_description text not null,
  script_description text not null,
  content_type content_type not null default 'long_videos',
  target_country varchar(200) not null,
  script_word_length varchar(20) not null,

  -- false = auto-created behind a "Get Top 10 Viral Topics" / generate call the
  -- user never explicitly saved; true = user clicked "Save as Template". The
  -- "My Templates" list only shows is_saved = true rows.
  is_saved boolean not null default false,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- If script_templates already exists in your Supabase project from before
-- target_country/script_word_length/is_saved were added, run this instead of
-- the create table above (it will fail on an existing table):
--   alter table script_templates add column target_country varchar(200) not null default '';
--   alter table script_templates add column script_word_length varchar(20) not null default '';
--   alter table script_templates alter column target_country drop default;
--   alter table script_templates alter column script_word_length drop default;
--   alter table script_templates add column is_saved boolean not null default true;
-- (default true on backfill so your existing rows -- all of which you saved
-- deliberately before is_saved existed -- keep showing up in "My Templates";
-- the column's default for *new* rows going forward is false, set above.)

create table researched_topics (
  id uuid primary key default gen_random_uuid(),

  script_template_id uuid not null references script_templates (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,

  -- 1-10, one slot per topic in a "Get Top 10 Viral Topics" batch. Re-researching
  -- the same script_template updates these 10 rows in place rather than creating
  -- new ones, so a template always has at most 10 researched_topics rows.
  topic_number int not null,

  topic_name varchar(300) not null,
  brief_description text not null,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),

  unique (script_template_id, topic_number)
);

create table generated_scripts (
  id uuid primary key default gen_random_uuid(),

  script_template_id uuid not null references script_templates (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,

  -- Denormalized, not a FK to researched_topics -- a script must survive even
  -- after its originating topic batch gets replaced by a later research call.
  topic_name text not null,
  script_text text not null,

  -- Characters involved, serialized as delimited text (characters joined by
  -- "|||", each character's fields joined by "::") and parsed back into
  -- structured objects by the backend on read.
  character_involved text,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table project_characters (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null references projects (id) on delete cascade,

  snapshot_name varchar(200) not null,
  snapshot_description text not null,
  snapshot_character_sheet_url text not null,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table scenes (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null references projects (id) on delete cascade,

  scene_number int not null,
  scene_text text not null,

  scene_image_prompt text,
  scene_animation_prompt text,

  generated_image_url text,
  generated_animation_url text,

  image_status generation_status not null default 'pending',
  animation_status generation_status not null default 'pending',

  -- Stamped with a fresh uuid when a generation starts. The write-back at the end
  -- of generation is guarded on the token still matching, so a generation the user
  -- cancelled -- or one superseded by a later click after they edited the prompt --
  -- can never land its stale image/animation on top of the newer one.
  image_generation_token uuid,
  animation_generation_token uuid,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),

  unique (project_id, scene_number)
);

create table scene_characters (
  id uuid primary key default gen_random_uuid(),

  scene_id uuid not null references scenes (id) on delete cascade,
  project_character_id uuid not null references project_characters (id) on delete cascade,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),

  unique (scene_id, project_character_id)
);

create table project_voiceovers (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null references projects (id) on delete cascade,

  voiceover_number int not null,
  voiceover_url text not null,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),

  unique (project_id, voiceover_number)
);

create table credit_topups (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  razorpay_order_id varchar(255) not null unique,
  razorpay_payment_id varchar(255),
  razorpay_signature text,

  amount_paid numeric not null,
  currency varchar(10) not null default 'INR',

  credits_added numeric not null,
  credits_balance_after numeric not null,

  payment_status payment_status not null default 'pending',

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- ==========================
-- vgai2admin (shared DB)
-- ==========================
-- These four tables are written by the vgai2admin portal, which runs against
-- this same Supabase project. Two of them are read by *this* app at runtime:
-- access_control_list / access_system_settings gate who may sign in and keep
-- using vgAI, and default_style_templates backs GET /styletemplates/defaults.
-- See vgai2admin/README.md for the full design.

-- One table for both email lists rather than separate allowed_users /
-- restricted_users tables -- identical columns and CRUD, and one admin popup
-- component serves both. Entries are emails, not user ids, so an address can be
-- listed before that person ever signs up. Stored lowercased/trimmed: Google
-- addresses are case-insensitive, so Foo@gmail.com must block foo@gmail.com.
create table access_control_list (
  id uuid primary key default gen_random_uuid(),

  email varchar(255) not null,
  list_type access_list_type not null,

  note text,

  created_at timestamp not null default now(),

  unique (email, list_type)
);

create index idx_acl_lookup on access_control_list (list_type, email);

-- Singleton -- the check constraint makes a second row impossible, so the
-- active mode is never ambiguous. Read on every authenticated request rather
-- than only at login: a JWT issued before a user was restricted stays valid
-- until it expires, so a login-only check would let an already-signed-in user
-- keep working indefinitely.
create table access_system_settings (
  id int primary key default 1 check (id = 1),
  mode access_system_mode not null default 'allowed_all',
  updated_at timestamp not null default now()
);

insert into access_system_settings (id, mode) values (1, 'allowed_all');

-- Access requests submitted from vgAI's public home page while the site is in
-- allowed_only mode. Approval also adds the email to access_control_list.
create table user_access_requests (
  id uuid primary key default gen_random_uuid(),
  email varchar(320) not null unique,
  purpose text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  requested_at timestamp not null default now(),
  reviewed_at timestamp,
  updated_at timestamp not null default now()
);

create index idx_user_access_requests_status
  on user_access_requests (status, requested_at desc);

create index idx_user_access_requests_requested
  on user_access_requests (requested_at desc);

-- Admin-granted free credits. Deliberately not extra credit_topups rows: that
-- table requires a unique razorpay_order_id, so a grant would need a fabricated
-- one polluting payment history and Razorpay reconciliation. Keeping them apart
-- also keeps "total purchased" honest -- a granted credit isn't a bought one.
-- The balance change goes through refund_credits() (an unguarded increment,
-- exactly a grant) so a concurrent generation can't clobber it; this is the
-- audit trail.
create table admin_credit_grants (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  credits_granted numeric not null check (credits_granted > 0),
  credits_balance_after numeric not null,

  reason text,

  -- `welcome` is the automatic, one-time new-account bonus. `admin` is a
  -- support/operator grant. Welcome rows are unique per user below.
  grant_kind varchar(20) not null default 'admin'
    check (grant_kind in ('admin', 'welcome')),

  created_at timestamp not null default now()
);

create index idx_admin_credit_grants_user
  on admin_credit_grants (user_id, created_at desc);

create unique index idx_admin_credit_grants_one_welcome_per_user
  on admin_credit_grants (user_id)
  where grant_kind = 'welcome';

-- The starter style-template catalog, replacing the bundled
-- backend/app/routes/styletemplates/default_style_templates.json so it can be
-- edited from the admin portal without a redeploy. Column names match that
-- JSON's keys and defaults.py's _IMPORTABLE_FIELDS exactly -- the frontend
-- derives its "In library" badge by matching a user's templates against catalog
-- entries field-by-field, so renaming one silently breaks that badge. `slug` is
-- an API contract (POST /styletemplates/defaults/{slug}/import reads every
-- field server-side from it), so treat it as immutable once an entry is live.
create table default_style_templates (
  id uuid primary key default gen_random_uuid(),

  slug varchar(200) not null unique,
  name varchar(200) not null,

  image_prompt text not null,
  animation_prompt text not null,
  youtube_title_description_tags_prompt text,
  youtube_thumbnail_image_prompt text,

  scene_density scene_density not null default 'small',
  image_aspect_ratio text not null,
  video_aspect_ratio text not null,
  description text not null,

  best_for text,
  demo_image_url text,

  is_published boolean not null default true,
  sort_order int not null default 0,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index idx_default_style_templates_published
  on default_style_templates (is_published, sort_order);

alter table default_style_templates
  add constraint default_style_templates_demo_image_urls_count
  check (jsonb_typeof(demo_image_urls) = 'array' and jsonb_array_length(demo_image_urls) <= 3);

-- The character-library counterpart of default_style_templates: the starter
-- catalog behind GET /characters/defaults, edited from the admin portal.
-- `slug` is likewise an API contract (POST /characters/defaults/{slug}/import
-- reads every field server-side from it), so treat it as immutable once live.
-- character_sheet_url is not-null here -- for a character the sheet *is* the
-- content, not a preview, and characters.character_sheet_url is not-null too,
-- so an entry without one could never produce a valid row on import.
create table default_characters (
  id uuid primary key default gen_random_uuid(),

  slug varchar(200) not null unique,
  name varchar(200) not null,
  description text not null,
  character_sheet_url text not null,

  best_for text,

  is_published boolean not null default true,
  sort_order int not null default 0,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index idx_default_characters_published
  on default_characters (is_published, sort_order);

-- Backs vgAI's /contact form; read and triaged from the vgai2admin portal.
-- user_id is nullable with `on delete set null` (not cascade) because the form
-- is reachable signed-out, a revoked user is exactly who most needs it, and a
-- report should outlive the account it came from. `contact` is free text since
-- the form accepts an email OR a mobile number.
create table contact_submissions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references users (id) on delete set null,

  name varchar(200) not null,
  contact varchar(320) not null,
  issue_description text not null,

  -- Cloudinary URL under <root>/contacts/ -- product-wide, not per-user, since
  -- a signed-out submitter has no user folder.
  screenshot_url text,

  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved')),
  admin_note text,

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index idx_contact_submissions_status
  on contact_submissions (status, created_at desc);

create index idx_contact_submissions_created
  on contact_submissions (created_at desc);

-- ==========================
-- Credit accounting (atomic)
-- ==========================
-- Credits are reserved BEFORE a provider call starts, not after it succeeds: the
-- provider bills us the moment the work begins, so a user who starts a generation
-- and then cancels must still pay for it. Credits come back only when the call
-- never produced anything we were billed for. See backend/app/credits.py.
--
-- These are database functions rather than a SELECT-then-UPDATE pair in Python
-- because a user can fire many generations at once (one per scene card). Separate
-- round trips all read the same starting balance and the last write wins, so N
-- concurrent generations get charged once. A single guarded UPDATE takes a row
-- lock, so concurrent callers serialize and each one sees the previous deduction.

-- Deducts p_amount, refusing to go negative. Raises INSUFFICIENT_CREDITS when the
-- balance guard fails (or the user doesn't exist); the caller maps that to a 402.
create or replace function spend_credits(
  p_user_id uuid,
  p_amount numeric,
  p_track_miscellaneous boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance numeric;
begin
  update users
     set current_credit_balance = current_credit_balance - p_amount,
         miscellaneous_credit_spent =
           miscellaneous_credit_spent + case when p_track_miscellaneous then p_amount else 0 end,
         updated_at = now()
   where id = p_user_id
     and current_credit_balance >= p_amount
  returning current_credit_balance into v_new_balance;

  if not found then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  return v_new_balance;
end;
$$;

-- Reverses spend_credits for a generation that never happened. No balance guard --
-- putting credits back can't overdraw.
create or replace function refund_credits(
  p_user_id uuid,
  p_amount numeric,
  p_track_miscellaneous boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance numeric;
begin
  update users
     set current_credit_balance = current_credit_balance + p_amount,
         miscellaneous_credit_spent =
           miscellaneous_credit_spent - case when p_track_miscellaneous then p_amount else 0 end,
         updated_at = now()
   where id = p_user_id
  returning current_credit_balance into v_new_balance;

  return v_new_balance;
end;
$$;

-- One running-total row per project (not one row per spend event), so this is a
-- fetch-or-create-then-increment -- which has the same lost-update race as the
-- balance did. Done as a single upsert so concurrent generations can't clobber
-- each other's increments. Pass a negative p_amount to reverse a reservation.
create unique index if not exists idx_project_expense_project
  on project_expence_tracker (project_id);

create or replace function add_project_expense(
  p_user_id uuid,
  p_project_id uuid,
  p_project_name varchar,
  p_kind text,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('llm', 'image', 'animation', 'voiceover', 'miscellaneous') then
    raise exception 'UNKNOWN_EXPENSE_KIND: %', p_kind;
  end if;

  insert into project_expence_tracker as t (
    user_id, project_id, project_name,
    llm_credit_spent, image_credit_spent, animation_credit_spent,
    voiceover_credit_spent, miscellaneous_credit_spent
  )
  values (
    p_user_id, p_project_id, p_project_name,
    case when p_kind = 'llm'           then p_amount else 0 end,
    case when p_kind = 'image'         then p_amount else 0 end,
    case when p_kind = 'animation'     then p_amount else 0 end,
    case when p_kind = 'voiceover'     then p_amount else 0 end,
    case when p_kind = 'miscellaneous' then p_amount else 0 end
  )
  on conflict (project_id) do update
     set llm_credit_spent           = t.llm_credit_spent           + excluded.llm_credit_spent,
         image_credit_spent         = t.image_credit_spent         + excluded.image_credit_spent,
         animation_credit_spent     = t.animation_credit_spent     + excluded.animation_credit_spent,
         voiceover_credit_spent     = t.voiceover_credit_spent     + excluded.voiceover_credit_spent,
         miscellaneous_credit_spent = t.miscellaneous_credit_spent + excluded.miscellaneous_credit_spent,
         project_name               = excluded.project_name,
         updated_at                 = now();
end;
$$;

-- If your Supabase project predates the generation-token columns above, run this
-- once (the create table statements will fail on existing tables):
--   alter table scenes add column image_generation_token uuid;
--   alter table scenes add column animation_generation_token uuid;
--   alter table projects add column thumbnail_generation_token uuid;
-- The unique index and the three functions above are safe to re-run as-is. If the
-- index errors, you have duplicate project_expence_tracker rows for one project
-- from before it existed -- collapse them first:
--   with merged as (
--     select project_id,
--            min(id) as keep_id,
--            sum(llm_credit_spent) as llm,
--            sum(image_credit_spent) as image,
--            sum(animation_credit_spent) as animation,
--            sum(voiceover_credit_spent) as voiceover
--       from project_expence_tracker group by project_id having count(*) > 1
--   )
--   update project_expence_tracker t
--      set llm_credit_spent = m.llm, image_credit_spent = m.image,
--          animation_credit_spent = m.animation, voiceover_credit_spent = m.voiceover
--     from merged m where t.id = m.keep_id;
--   delete from project_expence_tracker t using merged m
--    where t.project_id = m.project_id and t.id <> m.keep_id;

-- Atomically settles a successful Razorpay credit top-up. Both the signed
-- browser callback and Razorpay's payment.captured webhook call this function;
-- locking the order row makes those concurrent paths safe and idempotent.
create or replace function settle_credit_topup(
  p_order_id varchar,
  p_payment_id varchar,
  p_signature text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup credit_topups%rowtype;
  v_new_balance numeric;
begin
  select * into v_topup
    from credit_topups
   where razorpay_order_id = p_order_id
   for update;

  -- Razorpay may deliver an event for an order that was not created by this
  -- application. Acknowledging it is safer than retrying forever.
  if not found then
    return null;
  end if;

  if v_topup.payment_status = 'success' then
    select current_credit_balance into v_new_balance
      from users where id = v_topup.user_id;
    return v_new_balance;
  end if;

  update users
     set current_credit_balance = current_credit_balance + v_topup.credits_added,
         updated_at = now()
   where id = v_topup.user_id
  returning current_credit_balance into v_new_balance;

  update credit_topups
     set payment_status = 'success',
         razorpay_payment_id = p_payment_id,
         razorpay_signature = coalesce(p_signature, razorpay_signature),
         credits_balance_after = v_new_balance,
         updated_at = now()
   where id = v_topup.id;

  return v_new_balance;
end;
$$;

-- Creates a product user and its 20-credit welcome bonus as one operation.
-- The conflict path returns the existing account unchanged, making duplicate
-- Supabase SIGNED_IN callbacks safe. The grant row doubles as the account
-- history record shown in Profile and enforces one welcome bonus per user.
create or replace function create_user_with_welcome_bonus(
  p_user_id uuid,
  p_email varchar,
  p_name varchar default null,
  p_profile_image_url text default null
)
returns setof users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_count integer;
  v_balance numeric;
begin
  insert into users (id, email, name, profile_image_url)
  values (p_user_id, p_email, p_name, p_profile_image_url)
  on conflict (id) do nothing;

  get diagnostics v_created_count = row_count;

  if v_created_count = 1 then
    update users
       set current_credit_balance = current_credit_balance + 20,
           updated_at = now()
     where id = p_user_id
     returning current_credit_balance into v_balance;

    insert into admin_credit_grants (
      user_id, credits_granted, credits_balance_after, reason, grant_kind
    ) values (
      p_user_id, 20, v_balance, 'Welcome bonus — your first login', 'welcome'
    );
  end if;

  return query select * from users where id = p_user_id;
end;
$$;

-- ==========================
-- Row Level Security
-- ==========================
-- The FastAPI backend talks to Supabase with the service-role key, which
-- bypasses RLS entirely. Nothing else (the frontend, the anon/publishable
-- key) should be able to read or write these tables directly, so RLS is
-- enabled with no policies -- a default-deny lockout for every role except
-- the service role.

alter table users enable row level security;
alter table project_expence_tracker enable row level security;
alter table projects enable row level security;
alter table style_templates enable row level security;
alter table characters enable row level security;
alter table script_templates enable row level security;
alter table researched_topics enable row level security;
alter table generated_scripts enable row level security;
alter table project_characters enable row level security;
alter table scenes enable row level security;
alter table scene_characters enable row level security;
alter table project_voiceovers enable row level security;
alter table credit_topups enable row level security;

-- vgai2admin's tables, same default-deny lockout. Both backends reach these
-- with the service-role key, which bypasses RLS.
alter table access_control_list enable row level security;
alter table access_system_settings enable row level security;
alter table user_access_requests enable row level security;
alter table admin_credit_grants enable row level security;
alter table default_style_templates enable row level security;
alter table default_characters enable row level security;
alter table contact_submissions enable row level security;
