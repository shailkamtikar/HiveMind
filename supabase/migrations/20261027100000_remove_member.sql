-- Owners can remove a member. A removed person loses the conversation at once and cannot get back in with a link
-- that existed when they were removed; the owner can invite them again later with a new link.

create table public.group_removals (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
-- Server-side bookkeeping only: RLS on, no policies, no client grants.
alter table public.group_removals enable row level security;
revoke all on public.group_removals from anon, authenticated;
grant select, insert, update, delete on public.group_removals to service_role;

create function public.remove_member(p_group_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hit int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'only the owner can remove members' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'the owner cannot be removed' using errcode = '22023';
  end if;

  -- Same lock as redeem_invitation takes, so a removal and a join cannot interleave.
  perform 1 from public.groups g where g.id = p_group_id for update;

  delete from public.group_members m where m.group_id = p_group_id and m.user_id = p_user_id;
  get diagnostics hit = row_count;
  if hit > 0 then
    insert into public.group_removals as r (group_id, user_id) values (p_group_id, p_user_id)
    on conflict (group_id, user_id) do update set removed_at = now();
  end if;
  return hit > 0;
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- redeem_invitation: a person removed after an invitation was created cannot use that invitation.
-- (Replaces the version from 20261026131000; same signature and answers.)
create or replace function public.redeem_invitation(p_token_hash text)
returns table (status text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  inv_created timestamptz;
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

  select i.group_id, i.created_at into gid, inv_created
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

  if exists (select 1 from public.group_removals r where r.group_id = gid and r.user_id = uid and r.removed_at >= inv_created) then
    return query select 'invalid'::text, null::uuid;
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
