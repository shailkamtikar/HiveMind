-- Rollback for 20261026141000_job_functions.sql. Existing queued jobs remain, harmlessly.
drop function if exists public.fail_job(uuid, text);
drop function if exists public.complete_job(uuid, text);
drop function if exists public.claim_next_job(uuid, int, int);
