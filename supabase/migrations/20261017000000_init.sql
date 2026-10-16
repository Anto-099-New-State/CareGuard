-- CareGuard schema. The database caches money state; the contract is the truth.
-- Wiping these tables and re-running the indexer must rebuild balances and statuses.
--
-- Amounts are integers in USDC base units (6 decimals): 125.00 USDC = 125000000.
-- All writes go through the API with the service key (which bypasses RLS); the policies below
-- only grant reads to signed-in users, so the browser can subscribe to realtime safely.

-- ------------------------------------------------------------------ types

create type episode_status as enum ('created', 'funded', 'active', 'margin_call', 'closed', 'expired');
create type payer_role as enum ('coverer', 'family');
create type pay_currency as enum ('USDC', 'EURC');
create type charge_status as enum ('waiting', 'paid', 'escalated', 'rejected');
create type decision_kind as enum ('size', 'review', 'escalate', 'margin_call', 'discharge');
create type decision_outcome as enum ('sized', 'pay', 'escalate', 'margin_call', 'reject', 'approve', 'discharge');
create type tx_kind as enum ('create', 'fund', 'swap', 'charge', 'margin_call', 'decision', 'refund');
create type tx_status as enum ('pending', 'confirmed', 'failed');
create type network_name as enum ('local', 'testnet', 'mainnet');

-- ------------------------------------------------------------------ tables

create table providers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users (id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  wallet_id      text,
  wallet_address text,
  created_at     timestamptz not null default now()
);

-- Humans on our team who sign over-cap charges. The approver key itself never touches the server.
create table approvers (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  wallet_address text not null,
  created_at     timestamptz not null default now()
);

-- Entered by the real provider. Never seeded.
create table price_items (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references providers (id) on delete cascade,
  code            text not null check (length(trim(code)) > 0),
  label           text not null check (length(trim(label)) > 0),
  unit_price_usdc bigint not null check (unit_price_usdc > 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (provider_id, code)
);

create table episodes (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references providers (id) on delete restrict,
  network             network_name not null,
  contract_episode_id bigint,
  patient_label       text not null,           -- e.g. "Maria L." — no medical data
  description         text not null default '', -- e.g. "implant + crown"; provider and approver only
  quote_usdc          bigint not null check (quote_usdc > 0),
  contingency_pct     numeric(5, 2) not null check (contingency_pct >= 0 and contingency_pct <= 100),
  guarantee_usdc      bigint check (guarantee_usdc > 0),
  per_charge_cap      bigint check (per_charge_cap > 0),
  covered_codes       text[] not null default '{}', -- price item codes the coverer pays for
  covered_pct         numeric(5, 2) not null default 100 check (covered_pct >= 0 and covered_pct <= 100),
  expires_at          timestamptz,
  status              episode_status not null default 'created',
  coverer_balance     bigint not null default 0, -- cache of the contract's covererBalance
  family_balance      bigint not null default 0, -- cache of the contract's familyBalance
  paid_total          bigint not null default 0,
  is_internal_test    boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (network, contract_episode_id)
);

-- The provider's quote, line by line. Used to size the guarantee and to estimate remaining cost.
create table quote_items (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null references episodes (id) on delete cascade,
  price_item_id uuid not null references price_items (id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  unique (episode_id, price_item_id)
);

create table payers (
  id             uuid primary key default gen_random_uuid(),
  episode_id     uuid not null references episodes (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null, -- linked when they sign in with this email
  email          text not null,
  display_name   text not null,
  role           payer_role not null,
  currency       pay_currency not null default 'USDC',
  wallet_id      text,
  wallet_address text,
  owed_usdc      bigint not null default 0 check (owed_usdc >= 0),
  funded_usdc    bigint not null default 0 check (funded_usdc >= 0),
  created_at     timestamptz not null default now(),
  unique (episode_id, role)
);

create table charges (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null references episodes (id) on delete cascade,
  number        integer not null, -- #1, #2… within the episode
  price_item_id uuid references price_items (id) on delete restrict, -- null = not on the price list
  description   text not null default '', -- provider and approver only
  quantity      integer not null default 1 check (quantity > 0),
  amount_usdc   bigint not null check (amount_usdc > 0),
  covered_usdc  bigint not null default 0 check (covered_usdc >= 0 and covered_usdc <= amount_usdc),
  status        charge_status not null default 'waiting',
  salt          text not null,
  hash          text not null unique, -- bytes32 hex; the contract's chargeUsed key
  tx_hash       text,
  reject_reason text,
  created_at    timestamptz not null default now(),
  unique (episode_id, number)
);

create table decisions (
  id               uuid primary key default gen_random_uuid(),
  episode_id       uuid not null references episodes (id) on delete cascade,
  charge_id        uuid references charges (id) on delete set null,
  kind             decision_kind not null,
  inputs           jsonb not null, -- may include descriptions: provider and approver only
  outcome          decision_outcome not null,
  reason           text not null check (length(trim(reason)) > 0), -- one plain sentence, no medical detail
  salt             text not null,
  hash             text not null unique,
  tx_hash          text,
  approver_verdict text check (approver_verdict in ('approved', 'rejected')),
  created_at       timestamptz not null default now()
);

create table transactions (
  id         uuid primary key default gen_random_uuid(),
  episode_id uuid references episodes (id) on delete cascade,
  kind       tx_kind not null,
  payer_id   uuid references payers (id) on delete set null,
  amount     bigint,
  currency   pay_currency,
  tx_hash    text,
  status     tx_status not null default 'pending',
  error      text, -- plain reason shown to the user when status = failed
  network    network_name not null,
  created_at timestamptz not null default now(),
  unique (network, tx_hash)
);

-- Indexer cursor, one row per network. Lets the indexer resume and be run twice safely.
create table indexer_state (
  network    network_name primary key,
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

-- Events already applied, so a replay never double-counts.
create table chain_events (
  network      network_name not null,
  tx_hash      text not null,
  log_index    integer not null,
  block_number bigint not null,
  event_name   text not null,
  args         jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (network, tx_hash, log_index)
);

create index on price_items (provider_id);
create index on episodes (provider_id);
create index on payers (episode_id);
create index on payers (user_id);
create index on payers (lower(email));
create index on charges (episode_id);
create index on charges (status) where status = 'escalated';
create index on decisions (episode_id, created_at);
create index on transactions (episode_id, created_at);

-- ------------------------------------------------------------------ access helpers
-- security definer so policies can check membership without recursing through RLS.

create function is_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from approvers where user_id = auth.uid());
$$;

create function my_provider_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from providers where user_id = auth.uid();
$$;

create function is_episode_provider(ep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from episodes e join providers p on p.id = e.provider_id
    where e.id = ep and p.user_id = auth.uid()
  );
$$;

create function is_episode_payer(ep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payers where episode_id = ep and user_id = auth.uid());
$$;

create function is_episode_party(ep uuid) returns boolean
language sql stable as $$
  select is_episode_provider(ep) or is_episode_payer(ep) or is_approver();
$$;

-- ------------------------------------------------------------------ row-level security

alter table providers     enable row level security;
alter table approvers     enable row level security;
alter table price_items   enable row level security;
alter table episodes      enable row level security;
alter table quote_items   enable row level security;
alter table payers        enable row level security;
alter table charges       enable row level security;
alter table decisions     enable row level security;
alter table transactions  enable row level security;
alter table indexer_state enable row level security;
alter table chain_events  enable row level security;

create policy "provider reads self" on providers for select to authenticated
  using (user_id = auth.uid() or is_approver());

create policy "approver reads self" on approvers for select to authenticated
  using (user_id = auth.uid());

create policy "provider reads own prices" on price_items for select to authenticated
  using (provider_id = my_provider_id() or is_approver());

create policy "parties read episode" on episodes for select to authenticated
  using (is_episode_party(id));

create policy "provider reads quote" on quote_items for select to authenticated
  using (is_episode_provider(episode_id) or is_approver());

create policy "parties read payers" on payers for select to authenticated
  using (is_episode_provider(episode_id) or user_id = auth.uid() or is_approver());

-- Payers never see charge descriptions: they read charges through payer_charges below.
create policy "provider and approver read charges" on charges for select to authenticated
  using (is_episode_provider(episode_id) or is_approver());

-- Decision inputs can include descriptions: payers read decisions through payer_decisions below.
create policy "provider and approver read decisions" on decisions for select to authenticated
  using (is_episode_provider(episode_id) or is_approver());

create policy "parties read transactions" on transactions for select to authenticated
  using (episode_id is not null and is_episode_party(episode_id));

-- indexer_state and chain_events: no policies, so only the service key reads them.

-- ------------------------------------------------------------------ payer views
-- Views run with the owner's rights, so each one filters to the caller's own episodes.

create view payer_charges as
  select c.id, c.episode_id, c.number, coalesce(pi.label, 'Other') as category, c.quantity,
         c.amount_usdc, c.covered_usdc, c.status, c.tx_hash, c.created_at
  from charges c
  left join price_items pi on pi.id = c.price_item_id
  where is_episode_payer(c.episode_id);

create view payer_decisions as
  select d.id, d.episode_id, d.charge_id, d.kind, d.outcome, d.reason, d.hash, d.tx_hash, d.created_at
  from decisions d
  where is_episode_payer(d.episode_id);

revoke all on payer_charges, payer_decisions from anon;
grant select on payer_charges, payer_decisions to authenticated;

-- ------------------------------------------------------------------ realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table episodes, payers, charges, decisions, transactions;
  end if;
end $$;
