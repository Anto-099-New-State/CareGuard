-- Wallet-only sign-in (Sign-In with Ethereum). Everyone signs in with the wallet they pay or get paid with,
-- and picks a role the first time. Payers are matched to episodes by wallet address instead of email.

create type app_role as enum ('provider', 'patient');

create table profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  wallet_address text not null unique check (wallet_address ~ '^0x[0-9a-f]{40}$'), -- lower-case
  role           app_role not null,
  display_name   text not null check (length(trim(display_name)) > 0),
  created_at     timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "users read own profile" on profiles for select to authenticated using (user_id = auth.uid());

-- Payers are invited by wallet; email becomes optional contact info.
alter table payers alter column email drop not null;
create index on payers (lower(wallet_address));

-- The signed-in user's wallet, from their profile.
create function my_wallet() returns text
language sql stable security definer set search_path = public as $$
  select wallet_address from profiles where user_id = auth.uid();
$$;

-- A payer is now whoever holds the payer's wallet, whether or not the row is linked to their account yet.
create or replace function is_episode_payer(ep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from payers
    where episode_id = ep
      and (user_id = auth.uid() or (wallet_address is not null and lower(wallet_address) = my_wallet()))
  );
$$;

drop policy "parties read payers" on payers;
create policy "parties read payers" on payers for select to authenticated
  using (is_episode_provider(episode_id) or is_episode_payer(episode_id) or is_approver());

-- Payers see the quote they are asked to fund (item labels and prices, not the treatment description).
drop policy "provider reads quote" on quote_items;
create policy "parties read quote" on quote_items for select to authenticated
  using (is_episode_party(episode_id));

