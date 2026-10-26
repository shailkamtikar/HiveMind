-- Rollback for 20261026140000_ai_jobs.sql
alter publication supabase_realtime drop table public.ai_jobs;
drop trigger if exists messages_enqueue_ai_job on public.messages;
drop function if exists public.enqueue_ai_job();
drop index if exists public.messages_one_assistant_reply_per_job;
drop table if exists public.ai_jobs;
