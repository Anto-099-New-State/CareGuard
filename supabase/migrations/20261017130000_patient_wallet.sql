-- The patient's wallet is recorded when the hospital opens the episode, so the patient can always follow their own
-- treatment, even when a relative or insurer pays. The patient reads with payer-level privacy: amounts and categories,
-- never the treatment description or the agent's raw inputs.

alter table episodes add column patient_wallet text check (patient_wallet ~ '^0x[0-9a-f]{40}$'); -- lower-case
create index on episodes (patient_wallet);

create or replace function is_episode_payer(ep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from payers
    where episode_id = ep
      and (user_id = auth.uid() or (wallet_address is not null and lower(wallet_address) = my_wallet()))
  ) or exists (
    select 1 from episodes where id = ep and patient_wallet is not null and patient_wallet = my_wallet()
  );
$$;
