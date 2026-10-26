-- Rollback for 20261026150000_job_retry.sql
-- Restores the earlier claim_next_job and fail_job (from 20261026141000_job_functions.sql).
drop function if exists public.retry_job(uuid);

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
     set status = 'failed', error_category = p_category, locked_at = null
   where id = p_job_id and status = 'processing';
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

alter table public.ai_jobs drop column if exists cooldown_until;
