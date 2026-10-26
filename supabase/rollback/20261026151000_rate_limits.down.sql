-- Rollback for 20261026151000_rate_limits.sql
drop function if exists public.check_rate_limit(uuid, text, int, int);
drop table if exists public.rate_limits;
