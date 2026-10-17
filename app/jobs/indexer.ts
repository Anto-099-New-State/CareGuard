/**
 * Reads CareGuardEpisode events and updates Supabase. Safe to run twice: each event is recorded once
 * (chain_events primary key), and balances/statuses are re-read from the contract, which is the truth.
 *
 *   npm run indexer            # catch up once
 *   npm run indexer -- --watch # keep following new blocks
 *   npm run indexer -- --from 0  # rebuild from the deploy block after wiping the cache
 */
import { setTimeout as delay } from "node:timers/promises";
import { parseEventLogs } from "viem";
import { publicClient } from "../lib/chains";
import { config } from "../lib/config";
import { careGuard } from "../lib/contract";
import { db, must, type EpisodeRow } from "../lib/server/db";
import { refreshFromChain } from "../lib/server/episodes";
import { canonicalJson } from "../lib/server/hash";

// Arc Testnet's RPC caps eth_getLogs ranges; start small and halve when a provider refuses.
let chunk = BigInt(process.env.INDEXER_CHUNK ?? 2_000);
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const fromArg = args.includes("--from") ? BigInt(args[args.indexOf("--from") + 1]) : null;

async function cursor(): Promise<bigint> {
  if (fromArg !== null) return fromArg > BigInt(config.deployBlock) ? fromArg : BigInt(config.deployBlock);
  const { data } = await db().from("indexer_state").select("last_block").eq("network", config.network).maybeSingle();
  return data ? BigInt(data.last_block) + 1n : BigInt(config.deployBlock);
}

async function applyRange(from: bigint, to: bigint) {
  // Filter by address only and decode here: Arc's RPC refuses a filter listing every event topic.
  const raw = await publicClient.getLogs({ address: careGuard.address, fromBlock: from, toBlock: to });
  const logs = parseEventLogs({ abi: careGuard.abi, logs: raw });
  const touched = new Set<bigint>();

  for (const log of logs) {
    const args = (log.args ?? {}) as Record<string, unknown>;
    const { error } = await db()
      .from("chain_events")
      .upsert(
        {
          network: config.network,
          tx_hash: log.transactionHash,
          log_index: log.logIndex,
          block_number: Number(log.blockNumber),
          event_name: log.eventName,
          args: JSON.parse(canonicalJson(args)),
        },
        { onConflict: "network,tx_hash,log_index", ignoreDuplicates: true },
      );
    if (error) throw new Error(`Couldn't record ${log.eventName} in ${log.transactionHash}: ${error.message}`);

    if (typeof args.episodeId === "bigint") touched.add(args.episodeId);

    if (log.eventName === "ChargePaid") {
      // Matches by the salted hash, so a charge paid while the API was down still shows as paid.
      await db().from("charges").update({ status: "paid", tx_hash: log.transactionHash, covered_usdc: String(args.coveredAmount) }).eq("hash", args.chargeHash as string).neq("status", "paid");
    }
    if (log.eventName === "DecisionLogged") {
      await db().from("decisions").update({ tx_hash: log.transactionHash }).eq("hash", args.decisionHash as string).is("tx_hash", null);
    }
    if (log.eventName === "EpisodeCreated") {
      const linked = (await db().from("episodes").select("id").eq("network", config.network).eq("contract_episode_id", Number(args.episodeId)).maybeSingle()).data;
      if (!linked) console.warn(`Episode ${args.episodeId} exists onchain but has no database row (created by another deployment or a lost API response).`);
    }
  }

  for (const id of touched) {
    const ep = (await db().from("episodes").select("*").eq("network", config.network).eq("contract_episode_id", Number(id)).maybeSingle()).data as EpisodeRow | null;
    if (ep) await refreshFromChain(ep);
  }

  must(
    await db()
      .from("indexer_state")
      .upsert({ network: config.network, last_block: Number(to), updated_at: new Date().toISOString() })
      .select()
      .single(),
  );
  return logs.length;
}

async function catchUp() {
  const head = await publicClient.getBlockNumber();
  let from = await cursor();
  let total = 0;
  while (from <= head) {
    const to = from + chunk - 1n < head ? from + chunk - 1n : head;
    try {
      total += await applyRange(from, to);
    } catch (err) {
      if (chunk > 50n && /range|too large|limit|exceed/i.test(err instanceof Error ? err.message : "")) {
        chunk /= 2n;
        continue; // retry the same start with a smaller range
      }
      throw err;
    }
    from = to + 1n;
  }
  return { head, total };
}

async function main() {
  if (/^0x0+$/.test(config.contractAddress)) throw new Error(`No contract address in config/${config.network}.json yet. Deploy first.`);
  do {
    const { head, total } = await catchUp();
    if (total > 0 || !watch) console.log(`[${config.network}] indexed ${total} events up to block ${head}`);
    if (watch) await delay(4_000);
  } while (watch);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
