-- Redeeming an invitation: the caller becomes a member, atomically and idempotently.
--
-- Takes the SHA-256 hash of the token (the app hashes it server-side). Unknown, malformed, expired and
-- revoked links all answer 'invalid' so nobody can probe which private groups exist.

create function public.redeem_invitation(p_token_hash text)
returns table (status text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  lim int;
  cnt int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  select i.group_id into gid
    from public.invitations i
   where i.token_hash = p_token_hash
     and i.revoked_at is null
     and i.expires_at > now();
  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- Joins to one group run one at a time, so two people cannot both take the last seat.
  select g.member_limit into lim from public.groups g where g.id = gid for update;
  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid) then
    return query select 'already_member'::text, gid;
    return;
  end if;

  select count(*) into cnt from public.group_members m where m.group_id = gid;
  if cnt >= lim then
    return query select 'full'::text, null::uuid;
    return;
  end if;

  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'member');
  return query select 'joined'::text, gid;
end;
$$;

revoke execute on function public.redeem_invitation(text) from public, anon;
grant execute on function public.redeem_invitation(text) to authenticated;
