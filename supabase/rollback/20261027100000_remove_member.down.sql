-- Rollback for 20261027100000_remove_member.sql
-- Restores redeem_invitation from 20261026131000 (without the removal check), then drops the new objects.
create or replace function public.redeem_invitation(p_token_hash text)
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

drop function if exists public.remove_member(uuid, uuid);
drop table if exists public.group_removals;
