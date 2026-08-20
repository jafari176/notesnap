-- NoteSnap notes metadata table (AWS-ARCHITECTURE-SPEC.md §3.1)
-- Content bodies live in S3, not here — this table stays small and fast
-- regardless of note volume. Authorization is enforced in Lambda code
-- (WHERE user_id = ...), not by RDS itself; see infra/lambda/lib/db.ts.

create table if not exists notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,              -- Cognito 'sub' claim
  video_id      text not null,
  video_title   text,                       -- null while status = 'generating'
  video_channel text,
  video_url     text not null,
  duration_s    integer,                    -- null while status = 'generating'
  s3_key        text,                       -- null until status = 'ready'; pointer to the note JSON in S3
  edited        boolean not null default false,
  -- Async generation (see generate-notes.ts): API Gateway HTTP APIs hard-cap
  -- Lambda integration timeout at 29s (a CDK-enforced ceiling, confirmed
  -- against the installed aws-cdk-lib version), but a full Gemini generation
  -- with the 8-mode responseSchema regularly takes 34-51s. The synchronous
  -- request kicks off an async self-invocation and returns immediately; the
  -- client polls GET /notes/{id} until status flips to ready or failed.
  status        text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  error_message text,                       -- populated when status = 'failed'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, video_id)
);

create index if not exists notes_user_id_idx on notes (user_id);

-- Migration for tables created before the async-generation change above —
-- safe to re-run, every statement is a no-op if already applied.
alter table notes alter column video_title drop not null;
alter table notes alter column duration_s drop not null;
alter table notes alter column s3_key drop not null;
alter table notes add column if not exists status text not null default 'ready';
alter table notes add column if not exists error_message text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notes_status_check'
  ) then
    alter table notes add constraint notes_status_check check (status in ('generating', 'ready', 'failed'));
  end if;
end $$;
