-- Inquira schema. Plain PostgreSQL 13+ (Neon, Supabase, RDS, local — any works).
-- Conversations double as leads.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'web' check (channel in ('web', 'whatsapp')),
  -- WhatsApp number (wa_id) for WhatsApp chats.
  external_user_id text,
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
  -- Append-only model message history (never rewritten).
  api_history jsonb not null default '[]'::jsonb
);

create index if not exists conversations_updated_at_idx on conversations (updated_at desc);
create unique index if not exists conversations_external_user_idx
  on conversations (channel, external_user_id) where external_user_id is not null;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  role text not null check (role in ('patient', 'assistant', 'staff')),
  text text not null,
  synced_to_ai boolean not null default true
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

-- Inbound webhook event ids, so retried deliveries are answered only once.
create table if not exists processed_events (
  id text primary key,
  created_at timestamptz not null default now()
);
