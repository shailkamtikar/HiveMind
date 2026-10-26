-- Invitations: owners create and revoke links; only a SHA-256 hash of each token is stored.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Hex SHA-256 of the raw token. The raw token exists only in the link handed to the owner once.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index invitations_group_idx on public.invitations (group_id, created_at desc);

-- ---------------------------------------------------------------- helpers
create function public.is_group_owner(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups
    where id = gid and owner_id = auth.uid()
  );
$$;

-- Creates an invitation for a group the caller owns. Expiry is computed here, never taken from the client.
create function public.create_invitation(p_group_id uuid, p_token_hash text, p_expiry_days int default 3)
returns table (id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  if p_expiry_days not between 1 and 30 then
    raise exception 'expiry must be between 1 and 30 days' using errcode = '22023';
  end if;

  return query
    insert into public.invitations (group_id, token_hash, created_by, expires_at)
    values (p_group_id, p_token_hash, uid, now() + make_interval(days => p_expiry_days))
    returning invitations.id, invitations.expires_at;
end;
$$;

-- Revokes one invitation of a group the caller owns. Returns false when there was nothing to revoke
-- (unknown id, another group's invitation, or already revoked): all indistinguishable to the caller.
create function public.revoke_invitation(p_group_id uuid, p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hit int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'only the owner can revoke invitations' using errcode = '42501';
  end if;

  update public.invitations
     set revoked_at = now()
   where id = p_invitation_id and group_id = p_group_id and revoked_at is null;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on public.invitations from anon, authenticated;
grant select, insert, update, delete on public.invitations to service_role;
-- Owners may read their invitations, but never the hash column.
grant select (id, group_id, created_by, created_at, expires_at, revoked_at) on public.invitations to authenticated;

revoke execute on function public.is_group_owner(uuid) from public, anon;
revoke execute on function public.create_invitation(uuid, text, int) from public, anon;
revoke execute on function public.revoke_invitation(uuid, uuid) from public, anon;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, int) to authenticated;
grant execute on function public.revoke_invitation(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.invitations enable row level security;

create policy invitations_select_owner on public.invitations for select to authenticated
  using (public.is_group_owner(group_id));
-- No insert/update/delete policies: all writes go through the functions above.
