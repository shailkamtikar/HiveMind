-- Broadcast new messages to subscribed clients. Realtime applies the table's RLS policies to every
-- event, so a client only receives rows from groups it belongs to.
alter publication supabase_realtime add table public.messages;
