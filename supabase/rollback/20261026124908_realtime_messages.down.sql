-- Rollback for 20261026124908_realtime_messages.sql
alter publication supabase_realtime drop table public.messages;
