-- Inquira: conversations double as leads.
-- All access goes through the server with the service_role key, so RLS is
-- enabled with no policies: the anon key can read or write nothing.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  stage text not null default 'new'
    check (stage in ('new', 'qualifying', 'qualified', 'handoff', 'booked', 'lost')),
  score int not null default 0 check (score between 0 and 100),
  handoff_reason text,
  unread_for_staff boolean not null default false,
  name text,
  country text,
  language text,
  treatment text,
  timeframe text,
  budget text,
  whatsapp text,
  email text,
  medical_notes text,
  summary text,
  -- Append-only Claude API message history (never rewritten).
  api_history jsonb not null default '[]'::jsonb
);

create index if not exists conversations_updated_at_idx on conversations (updated_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  role text not null check (role in ('patient', 'assistant', 'staff')),
  text text not null,
  synced_to_ai boolean not null default true
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

-- Atomic append so concurrent turns can't overwrite each other's history.
create or replace function append_api_history(conv_id uuid, entries jsonb)
returns void
language sql
as $$
  update conversations
  set api_history = api_history || entries, updated_at = now()
  where id = conv_id;
$$;

alter table conversations enable row level security;
alter table messages enable row level security;
revoke execute on function append_api_history(uuid, jsonb) from public, anon, authenticated;
