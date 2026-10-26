-- Job processing functions. Only the server (service_role) may run them; they are never exposed to clients.

-- Claims the oldest runnable job of a group, unless one is already being worked on.
-- A job stuck in 'processing' for longer than p_stale_after_seconds counts as abandoned and is
-- handed out again, up to p_max_attempts times; after that it is marked failed (timeout).
create function public.claim_next_job(p_group_id uuid, p_stale_after_seconds int default 90, p_max_attempts int default 3)
returns table (job_id uuid, trigger_message_id uuid, trigger_seq bigint, attempts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ai_jobs;
  stale_cutoff timestamptz := now() - make_interval(secs => p_stale_after_seconds);
begin
  -- One claimer per group at a time.
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

-- Stores the reply and marks the job done in one transaction. Returns false when there was nothing to do
-- (job already finished or failed), so calling it twice can never produce a second reply.
create function public.complete_job(p_job_id uuid, p_content text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.ai_jobs where id = p_job_id and status = 'processing' for update;
  if not found then
    return false;
  end if;

  insert into public.messages (group_id, sender_id, type, content, job_id)
  values (gid, null, 'assistant', left(p_content, 4000), p_job_id)
  on conflict (job_id) where type = 'assistant' and job_id is not null do nothing;

  update public.ai_jobs set status = 'succeeded', locked_at = null, error_category = null where id = p_job_id;
  return true;
end;
$$;

-- Records a failure with its category. Only a job that is currently being processed can fail.
create function public.fail_job(p_job_id uuid, p_category text)
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
     set status = 'failed', error_category = p_category, locked_at = null
   where id = p_job_id and status = 'processing';
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

revoke execute on function public.claim_next_job(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.complete_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_next_job(uuid, int, int) to service_role;
grant execute on function public.complete_job(uuid, text) to service_role;
grant execute on function public.fail_job(uuid, text) to service_role;
