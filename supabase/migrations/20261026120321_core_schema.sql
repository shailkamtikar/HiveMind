-- Core schema: profiles, groups, group_members, with Row Level Security.
-- Clients can only read; all writes go through functions or column-limited updates.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_limit int not null default 5 check (member_limit between 2 and 50),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_owner_id_idx on public.groups (owner_id);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

-- ---------------------------------------------------------------- helpers

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger groups_set_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

-- Profile row is created automatically for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Membership check used by policies. SECURITY DEFINER avoids recursive policy evaluation.
create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- Atomically creates a group and the owner's membership.
create function public.create_group(p_name text, p_member_limit int default 5)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_name text := btrim(coalesce(p_name, ''));
  new_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'group name must be 1 to 80 characters' using errcode = '22023';
  end if;
  if p_member_limit not between 2 and 50 then
    raise exception 'member limit must be between 2 and 50' using errcode = '22023';
  end if;

  insert into public.groups (name, owner_id, member_limit)
  values (clean_name, uid, p_member_limit)
  returning id into new_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_id, uid, 'owner');

  return new_id;
end;
$$;

-- ---------------------------------------------------------------- privileges
-- Start from nothing, then grant only what clients need.

revoke all on public.profiles, public.groups, public.group_members from anon, authenticated;

-- service_role (server-side only) manages data for tests and the AI processor; it bypasses RLS.
grant select, insert, update, delete on public.profiles, public.groups, public.group_members to service_role;

grant select on public.profiles, public.groups, public.group_members to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (name) on public.groups to authenticated;
grant delete on public.groups to authenticated;

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.create_group(text, int) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.create_group(text, int) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- profiles: own row, plus people who share a group with you.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.group_members me
      join public.group_members other on other.group_id = me.group_id
      where me.user_id = (select auth.uid()) and other.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- groups: members read; only the owner renames or deletes. No direct inserts (use create_group).
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy groups_update on public.groups for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = (select auth.uid()));

-- group_members: members see who is in their groups. Changes only via functions.
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
