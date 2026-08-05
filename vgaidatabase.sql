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

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users (id) on delete cascade,

  name varchar(200) not null,
  script text,

  is_liked boolean not null default false,

  llm_model_id varchar(200),
  image_model_id varchar(200),
  animation_model_id varchar(200),

  snapshot_styletemplate_name varchar(200),
  snapshot_styletemplate_image_prompt text,
  snapshot_styletemplate_animation_prompt text,
  snapshot_styletemplate_youtube_title_description_tags_prompt text,
  snapshot_styletemplate_youtube_thumbnail_image_prompt text,
  snapshot_styletemplate_description text,

  thumbnail_prompt text,
  thumbnail_image_url text,

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

  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

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
alter table project_characters enable row level security;
alter table scenes enable row level security;
alter table scene_characters enable row level security;
alter table project_voiceovers enable row level security;
alter table credit_topups enable row level security;
