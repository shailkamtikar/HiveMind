-- Failure handling: a quota cool-down per group, and a member-triggered retry capped at 3 attempts.

alter table public.ai_jobs add column cooldown_until timestamptz;
grant select (cooldown_until) on public.ai_jobs to authenticated;

-- claim_next_job: while a group is cooling down after a quota error, nothing is claimed, so the provider
-- is not hammered. (Replaces the version from 20261026141000; same signature.)
create or replace function public.claim_next_job(p_group_id uuid, p_stale_after_seconds int default 90, p_max_attempts int default 3)
returns table (job_id uuid, trigger_message_id uuid, trigger_seq bigint, attempts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ai_jobs;
  stale_cutoff timestamptz := now() - make_interval(secs => p_stale_after_seconds);
begin
  perform pg_advisory_xact_lock(hashtext(p_group_id::text));

  update public.ai_jobs a
     set status = 'failed', error_category = 'timeout'
   where a.group_id = p_group_id and a.status = 'processing' and a.locked_at < stale_cutoff and a.attempts >= p_max_attempts;

  if exists (
    select 1 from public.ai_jobs a
     where a.group_id = p_group_id and a.status = 'processing' and a.locked_at >= stale_cutoff
  ) then
    return;
  end if;

  if exists (
    select 1 from public.ai_jobs a where a.group_id = p_group_id and a.cooldown_until > now()
  ) then
    return;
  end if;

  select a.* into j
    from public.ai_jobs a
    join public.messages m on m.id = a.trigger_message_id
   where a.group_id = p_group_id
     and (a.status = 'queued' or (a.status = 'processing' and a.locked_at < stale_cutoff))
   order by m.seq
   limit 1
   for update of a skip locked;
  if not found then
    return;
  end if;

  update public.ai_jobs a
     set status = 'processing', locked_at = now(), attempts = j.attempts + 1, error_category = null
   where a.id = j.id;

  return query
    select j.id, j.trigger_message_id, m.seq, j.attempts + 1
      from public.messages m where m.id = j.trigger_message_id;
end;
$$;

-- fail_job: a quota failure also starts a 60 second cool-down for the whole group.
create or replace function public.fail_job(p_job_id uuid, p_category text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hit int;
begin
  if p_category not in ('quota', 'timeout', 'provider', 'safety', 'internal') then
    raise exception 'unknown error category' using errcode = '22023';
  end if;
  update public.ai_jobs
     set status = 'failed', error_category = p_category, locked_at = null,
         cooldown_until = case when p_category = 'quota' then now() + interval '60 seconds' else cooldown_until end
   where id = p_job_id and status = 'processing';
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- Member-triggered retry of a failed job. Uses the caller's own identity (auth.uid()), never a parameter.
-- Returns 'queued' | 'not_failed' | 'limit' | 'not_found'. Non-members and unknown ids both get 'not_found'.
-- The row lock makes a double click safe: the second call finds the job already queued.
create function public.retry_job(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ai_jobs;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select a.* into j from public.ai_jobs a where a.id = p_job_id for update;
  if not found or not public.is_group_member(j.group_id) then
    return 'not_found';
  end if;
  if j.status <> 'failed' then
    return 'not_failed';
  end if;
  if j.attempts >= 3 then
    return 'limit';
  end if;

  -- cooldown_until is kept on purpose: retrying does not skip a quota cool-down.
  update public.ai_jobs a set status = 'queued', error_category = null where a.id = j.id;
  return 'queued';
end;
$$;

revoke execute on function public.retry_job(uuid) from public, anon;
grant execute on function public.retry_job(uuid) to authenticated;
