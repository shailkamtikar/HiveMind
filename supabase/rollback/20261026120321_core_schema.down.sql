-- Rollback for 20261026120321_core_schema.sql. Destroys all profile/group/member data.
-- Order matters: profiles' policy reads group_members; group_members has a foreign key to groups;
-- the groups/group_members policies use is_group_member().
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.profiles;
drop table if exists public.group_members;
drop table if exists public.groups;
drop function if exists public.create_group(text, int);
drop function if exists public.is_group_member(uuid);
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
