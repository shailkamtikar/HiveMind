-- Rollback for 20261026130000_invitations.sql
-- Order matters: the table first (its policy uses is_group_owner), then the functions.
drop table if exists public.invitations;
drop function if exists public.revoke_invitation(uuid, uuid);
drop function if exists public.create_invitation(uuid, text, int);
drop function if exists public.is_group_owner(uuid);
