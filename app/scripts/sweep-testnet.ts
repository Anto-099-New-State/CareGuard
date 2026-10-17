/**
 * Testnet housekeeping after an internal test run: discharges the run's open episodes and returns the USDC left in
 * its payer wallets to the agent wallet. Only touches episodes marked is_internal_test and wallets we created for them.
 *   NEXT_PUBLIC_NETWORK=testnet npm run sweep:testnet
 */
import { createClient } from "@supabase/supabase-js";
import type { Address } from "viem";
import { publicClient } from "../lib/chains";
import { config, txUrl } from "../lib/config";
import { careGuard, erc20Abi } from "../lib/contract";
import { formatAmount } from "../lib/money";
import { agentSigner, send } from "../lib/server/chain";

if (config.network !== "testnet") throw new Error("sweep-testnet is for Arc Testnet only.");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const KEEP = 150_000n; // leave 0.15 USDC: Arc reserves the fee up front from the same balance

(async () => {
  const { data: eps } = await db.from("episodes").select("id, contract_episode_id, status").eq("network", "testnet").eq("is_internal_test", true).not("contract_episode_id", "is", null);
  for (const ep of eps ?? []) {
    const e = await publicClient.readContract({ ...careGuard, functionName: "getEpisode", args: [BigInt(ep.contract_episode_id)] });
    if (![1, 2, 3].includes(e.status)) continue; // Created, Active, MarginCall
    const hash = await send(agentSigner(), { ...careGuard, functionName: "discharge", args: [BigInt(ep.contract_episode_id)] });
    await db.from("episodes").update({ status: "closed", coverer_balance: 0, family_balance: 0 }).eq("id", ep.id);
    console.log(`discharged #${ep.contract_episode_id}: ${txUrl(hash)}`);
  }
  const ids = (eps ?? []).map((e) => e.id);
  const { data: payers } = await db.from("payers").select("wallet_id, wallet_address").in("episode_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const agent = agentSigner().address;
  let total = 0n;
  for (const p of payers ?? []) {
    if (!p.wallet_id || !p.wallet_address) continue;
    const held = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [p.wallet_address as Address] });
    if (held <= KEEP) continue;
    const amount = held - KEEP;
    const hash = await send({ address: p.wallet_address as Address, walletId: p.wallet_id }, { address: config.usdc, abi: erc20Abi, functionName: "transfer", args: [agent, amount] });
    total += amount;
    console.log(`returned ${formatAmount(amount)} USDC from ${p.wallet_address}: ${txUrl(hash)}`);
  }
  const now = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [agent] });
  console.log(`returned ${formatAmount(total)} USDC; agent now holds ${formatAmount(now)} USDC`);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
