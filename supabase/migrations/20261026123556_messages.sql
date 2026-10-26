-- Messages: append-only, ordered by a server-assigned sequence number.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  -- Deterministic total order. Clients sort by seq, never by their own clocks.
  seq bigint generated always as identity,
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Null for assistant/system messages, and when the sender's account is later deleted.
  sender_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('user', 'assistant', 'system')),
  -- Hard database cap; the app enforces the (smaller) configurable MAX_MESSAGE_LENGTH.
  content text not null check (char_length(content) between 1 and 4000),
  -- Set by the AI processor in Phase 4 (links a reply to its job).
  job_id uuid,
  created_at timestamptz not null default now(),
  constraint messages_seq_key unique (seq)
);
create index messages_group_seq_idx on public.messages (group_id, seq desc);

-- ---------------------------------------------------------------- privileges
revoke all on public.messages from anon, authenticated;
grant select, insert, update, delete on public.messages to service_role;
grant select on public.messages to authenticated;
-- Clients may only supply these columns; created_at, seq and job_id are server-controlled.
-- `id` is client-suppliable so a retried send is idempotent (same id cannot insert twice).
grant insert (id, group_id, sender_id, type, content) on public.messages to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.messages enable row level security;

create policy messages_select on public.messages for select to authenticated
  using (public.is_group_member(group_id));

-- Members may post user messages as themselves. Assistant/system rows are written only by the server.
-- No update or delete policies exist, so history cannot be edited from a client.
create policy messages_insert on public.messages for insert to authenticated
  with check (
    type = 'user'
    and sender_id = (select auth.uid())
    and public.is_group_member(group_id)
  );
