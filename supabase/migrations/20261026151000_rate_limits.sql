-- Per-user rate limiting in Postgres (serverless instances share no memory, and no extra paid service is used).
-- Fixed windows: one counter row per user, bucket and window.

create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 40),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Only the server touches this table: RLS on, no policies, no client grants.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

-- Counts one hit and says whether it is allowed. The caller passes the user id it has already verified.
create function public.check_rate_limit(p_user_id uuid, p_bucket text, p_max int, p_window_seconds int)
returns table (allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws timestamptz;
  h int;
begin
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;

  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, ws, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into h;

  -- Housekeeping without a cron job: now and then, drop counters from long-finished windows.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select h <= p_max, greatest(1, ceil(extract(epoch from (ws + make_interval(secs => p_window_seconds) - now())))::int);
end;
$$;

revoke execute on function public.check_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, int, int) to service_role;
