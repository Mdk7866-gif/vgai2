-- ======================================
-- Migration: reserve-first credits + generation tokens
-- Run this once in the Supabase SQL Editor (SQL Editor -> New query -> paste -> Run).
--
-- Everything here is already folded into vgaidatabase.sql for a fresh install;
-- this file is the incremental version for an existing project. It is safe to
-- re-run: the columns/index are guarded, and the functions are CREATE OR REPLACE.
--
-- Until this runs, every credit-spending endpoint will fail — the backend now
-- calls spend_credits()/refund_credits()/add_project_expense() instead of doing
-- its own read-then-write.
-- ======================================

-- 1. Generation tokens -------------------------------------------------------
-- Stamped when a generation starts; the write-back at the end only lands if the
-- token still matches. That's what makes Cancel actually discard a result rather
-- than letting a slow, abandoned request overwrite whatever the user generated
-- next after editing the prompt.

alter table scenes   add column if not exists image_generation_token uuid;
alter table scenes   add column if not exists animation_generation_token uuid;
alter table projects add column if not exists thumbnail_generation_token uuid;

-- 2. One expense row per project ---------------------------------------------
-- project_expence_tracker was always meant to hold exactly one running-total row
-- per project; the upsert in add_project_expense() below needs that enforced.
-- If this errors you have duplicate rows from before the constraint existed —
-- collapse them with the block at the bottom of this file, then re-run.

create unique index if not exists idx_project_expense_project
  on project_expence_tracker (project_id);

-- 3. Atomic credit functions -------------------------------------------------
-- A user can start several generations at once (one per scene card). Separate
-- SELECT-then-UPDATE round trips all read the same starting balance and the last
-- write wins, so N concurrent generations only got charged once. A single guarded
-- UPDATE takes a row lock, so concurrent callers serialize instead.

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

-- Pass a negative p_amount to reverse a reservation.
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
  if p_kind not in ('llm', 'image', 'animation', 'voiceover') then
    raise exception 'UNKNOWN_EXPENSE_KIND: %', p_kind;
  end if;

  insert into project_expence_tracker as t (
    user_id, project_id, project_name,
    llm_credit_spent, image_credit_spent, animation_credit_spent, voiceover_credit_spent
  )
  values (
    p_user_id, p_project_id, p_project_name,
    case when p_kind = 'llm'       then p_amount else 0 end,
    case when p_kind = 'image'     then p_amount else 0 end,
    case when p_kind = 'animation' then p_amount else 0 end,
    case when p_kind = 'voiceover' then p_amount else 0 end
  )
  on conflict (project_id) do update
     set llm_credit_spent       = t.llm_credit_spent       + excluded.llm_credit_spent,
         image_credit_spent     = t.image_credit_spent     + excluded.image_credit_spent,
         animation_credit_spent = t.animation_credit_spent + excluded.animation_credit_spent,
         voiceover_credit_spent = t.voiceover_credit_spent + excluded.voiceover_credit_spent,
         project_name           = excluded.project_name,
         updated_at             = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Only if step 2's index failed on duplicates: merge them, then re-run step 2.
-- ----------------------------------------------------------------------------
-- with merged as (
--   select project_id,
--          min(id) as keep_id,
--          sum(llm_credit_spent) as llm,
--          sum(image_credit_spent) as image,
--          sum(animation_credit_spent) as animation,
--          sum(voiceover_credit_spent) as voiceover
--     from project_expence_tracker group by project_id having count(*) > 1
-- )
-- update project_expence_tracker t
--    set llm_credit_spent = m.llm, image_credit_spent = m.image,
--        animation_credit_spent = m.animation, voiceover_credit_spent = m.voiceover
--   from merged m where t.id = m.keep_id;
--
-- delete from project_expence_tracker t
--  using (select project_id, min(id) as keep_id from project_expence_tracker
--          group by project_id having count(*) > 1) m
--  where t.project_id = m.project_id and t.id <> m.keep_id;

