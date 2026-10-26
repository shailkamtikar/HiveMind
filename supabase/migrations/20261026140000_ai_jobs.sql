-- AI jobs: one durable job per user message. The queue lives in Postgres, so a crashed or timed-out
-- request loses nothing, and "exactly one reply per message" is enforced by the database itself.

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- One job per message: the unique constraint makes enqueueing idempotent.
  trigger_message_id uuid not null unique references public.messages (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  attempts int not null default 0,
  -- Closed set; never provider text.
  error_category text check (error_category in ('quota', 'timeout', 'provider', 'safety', 'internal')),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_jobs_group_status_idx on public.ai_jobs (group_id, status, created_at);

create trigger ai_jobs_set_updated_at before update on public.ai_jobs
  for each row execute function public.set_updated_at();

-- A message can have at most one AI reply (also covers a slow original finishing after a retry).
create unique index messages_one_assistant_reply_per_job
  on public.messages (job_id) where type = 'assistant' and job_id is not null;

-- Every member message gets its job in the same transaction as the message itself.
create function public.enqueue_ai_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_jobs (group_id, trigger_message_id) values (new.group_id, new.id);
  return new;
end;
$$;

create trigger messages_enqueue_ai_job after insert on public.messages
  for each row when (new.type = 'user')
  execute function public.enqueue_ai_job();

-- ---------------------------------------------------------------- privileges
revoke all on public.ai_jobs from anon, authenticated;
grant select, insert, update, delete on public.ai_jobs to service_role;
-- Members may watch job state (to show "thinking"); nothing else. No client writes, ever.
grant select (id, group_id, trigger_message_id, status, attempts, error_category, created_at, updated_at)
  on public.ai_jobs to authenticated;
revoke execute on function public.enqueue_ai_job() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.ai_jobs enable row level security;
create policy ai_jobs_select_member on public.ai_jobs for select to authenticated
  using (public.is_group_member(group_id));

-- Realtime: members get job changes live (filtered by the policy above).
alter publication supabase_realtime add table public.ai_jobs;
