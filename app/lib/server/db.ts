import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { need } from "./env";
import { UserError } from "./errors";

let client: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS: only the API and jobs use it, never the browser. */
export function db(): SupabaseClient {
  client ??= createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** PostgREST returns int8 as a JSON number or string; amounts are always read back as bigint. */
export const big = (v: unknown): bigint => (v === null || v === undefined ? 0n : BigInt(String(v)));

/** Bigints go to PostgREST as strings so no precision is lost on the way in. */
export const str = (v: bigint) => v.toString();

/** Unwraps a Supabase result, turning a database error into a plain 500 and a missing row into a 404. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, notFound = "Not found."): T {
  if (res.error) throw new UserError(`Database error: ${res.error.message}`, 500);
  if (res.data === null || res.data === undefined) throw new UserError(notFound, 404);
  return res.data;
}

export type EpisodeRow = {
  id: string;
  provider_id: string;
  network: string;
  contract_episode_id: number | null;
  patient_label: string;
  patient_wallet: string | null;
  description: string;
  quote_usdc: number;
  contingency_pct: number;
  guarantee_usdc: number | null;
  per_charge_cap: number | null;
  covered_codes: string[];
  covered_pct: number;
  expires_at: string | null;
  status: "created" | "funded" | "active" | "margin_call" | "closed" | "expired";
  coverer_balance: number;
  family_balance: number;
  paid_total: number;
  is_internal_test: boolean;
  created_at: string;
};

export type PayerRow = {
  id: string;
  episode_id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  role: "coverer" | "family";
  currency: "USDC" | "EURC";
  wallet_id: string | null;
  wallet_address: string | null;
  owed_usdc: number;
  funded_usdc: number;
};

export type ChargeRow = {
  id: string;
  episode_id: string;
  number: number;
  price_item_id: string | null;
  description: string;
  quantity: number;
  amount_usdc: number;
  covered_usdc: number;
  status: "waiting" | "paid" | "escalated" | "rejected";
  salt: string;
  hash: string;
  tx_hash: string | null;
  reject_reason: string | null;
  created_at: string;
};

export type PriceItemRow = { id: string; provider_id: string; code: string; label: string; unit_price_usdc: number; active: boolean };

export type ProviderRow = { id: string; user_id: string; name: string; wallet_id: string | null; wallet_address: string | null };
