/**
 * TESTING.md layer 3: scenarios A–E on Arc Testnet with real Circle wallets, real Groq review and real signatures.
 * Tiny amounts (0.05–0.20 USDC); the agent wallet seeds each payer's Circle wallet. Every episode is an internal test.
 *
 * Needs the app running with NEXT_PUBLIC_NETWORK=testnet (and no AGENT_JUDGE), the Supabase keys of the database it
 * uses, and app/secrets/approver-testnet.txt. Scenario D waits for the 30-minute expiry, so a full run takes ~35 min.
 *   NEXT_PUBLIC_NETWORK=testnet AGENT_JUDGE= npm run e2e:testnet
 * Writes every explorer link to app/secrets/testnet-run.md (and prints it).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc, publicClient } from "../lib/chains";
import { config, txUrl } from "../lib/config";
import { careGuard, erc20Abi } from "../lib/contract";
import { formatAmount } from "../lib/money";
import { agentSigner, send } from "../lib/server/chain";

assert.equal(config.network, "testnet", "Run with NEXT_PUBLIC_NETWORK=testnet.");
assert.ok(process.env.AGENT_JUDGE !== "stub", "Unset AGENT_JUDGE: the testnet run uses the real Groq review.");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const approverKey = readFileSync("secrets/approver-testnet.txt", "utf8").match(/PRIVATE_KEY=(0x[0-9a-fA-F]+)/)![1] as Hex;
const approverAccount = privateKeyToAccount(approverKey);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const links: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] };
const log = (s: keyof typeof links, label: string, hash?: string | null) => hash && links[s].push(`- ${label}: ${txUrl(hash)}`);
const u = (n: number) => BigInt(Math.round(n * 1e6));

async function user(email: string) {
  const password = `testnet-e2e-${process.env.SUPABASE_SECRET_KEY!.slice(-8)}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message)) throw created.error;
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: data.user.id, token: data.session.access_token };
}

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}
async function okApi(token: string, method: string, path: string, body?: unknown) {
  const r = await api(token, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status}: ${r.json.error}`);
  return r.json;
}

/** Seeds a payer's Circle wallet from the agent wallet (USDC is also Arc's gas token). */
async function seed(address: string, amount: bigint, scenario: keyof typeof links) {
  const hash = await send(agentSigner(), { address: config.usdc, abi: erc20Abi, functionName: "transfer", args: [address as Address, amount] });
  log(scenario, `seed ${formatAmount(amount)} USDC to payer wallet`, hash);
}

async function lastTx(episodeId: string, kind: string) {
  const { data } = await admin.from("transactions").select("tx_hash").eq("episode_id", episodeId).eq("kind", kind).eq("status", "confirmed").order("created_at", { ascending: false }).limit(1);
  return data?.[0]?.tx_hash as string | undefined;
}

const results: { name: string; ok: boolean; note?: string }[] = [];
async function scenario(name: string, fn: () => Promise<void>) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name} (${Math.round((Date.now() - t) / 1000)}s)`);
  } catch (err) {
    results.push({ name, ok: false, note: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL ${name}\n     ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  const provider = await user("provider.testnet@e2e.local");
  const coverer = await user("coverer.testnet@e2e.local");
  const family = await user("family.testnet@e2e.local");
  const approver = await user("approver.testnet@e2e.local");
  await admin.from("approvers").upsert({ user_id: approver.id, wallet_address: approverAccount.address });
  const onchainApprover = await publicClient.readContract({ ...careGuard, functionName: "approver" });
  assert.equal(onchainApprover.toLowerCase(), approverAccount.address.toLowerCase(), "approver key matches the contract");

  await okApi(provider.token, "POST", "/api/provider", { name: "Testnet E2E Clinic" });
  const items = (await okApi(provider.token, "POST", "/api/price-list", {
    items: [
      { code: "CON-01", label: "Consultation", unitPrice: "0.10" },
      { code: "IMP-01", label: "Implant surgery", unitPrice: "0.20" },
      { code: "XR-01", label: "X-ray", unitPrice: "0.05" },
    ],
  })) as unknown as Json[];
  const id = (code: string) => items.find((i) => i.code === code)!.id as string;

  /** Quote CON×1, IMP×2, XR×1 = 0.55 USDC; IMP 70% covered. Seeds and funds unless told otherwise. */
  async function episode(s: keyof typeof links, opts: { capPct: number; family?: number; familyExtra?: number }) {
    const created = await okApi(provider.token, "POST", "/api/episodes", {
      patientLabel: `Testnet ${s}`,
      description: "internal testnet run",
      lines: [
        { priceItemId: id("CON-01"), quantity: 1 },
        { priceItemId: id("IMP-01"), quantity: 2 },
        { priceItemId: id("XR-01"), quantity: 1 },
      ],
      contingencyPct: 20,
      capPct: opts.capPct,
      coveredCodes: ["IMP-01"],
      coveredPct: 70,
      isInternalTest: true,
    });
    const epId = created.episode.id as string;
    const p = await okApi(provider.token, "POST", `/api/episodes/${epId}/payers`, {
      coverer: { email: "coverer.testnet@e2e.local", name: "Testnet Insurer", currency: "USDC" },
      family: { email: "family.testnet@e2e.local", name: "Testnet Family", currency: "USDC" },
    });
    log(s, "createEpisode", p.txHash);
    const owed = { coverer: BigInt(p.payers.coverer.owed_usdc), family: BigInt(p.payers.family.owed_usdc) };
    const familyFund = opts.family !== undefined ? u(opts.family) : owed.family;
    // Payer wallets pay their own gas in USDC, so seed a little extra.
    await seed(p.payers.coverer.wallet_address, owed.coverer + u(0.35), s);
    await seed(p.payers.family.wallet_address, familyFund + u(0.35 + (opts.familyExtra ?? 0)), s);
    await okApi(coverer.token, "POST", `/api/episodes/${epId}/fund`, { amount: formatAmount(owed.coverer) });
    log(s, "coverer fund", await lastTx(epId, "fund"));
    await okApi(family.token, "POST", `/api/episodes/${epId}/fund`, { amount: formatAmount(familyFund) });
    log(s, "family fund", await lastTx(epId, "fund"));
    return { epId, contractId: BigInt(p.episode.contract_episode_id), payers: p.payers, created };
  }
  const charge = (epId: string, body: Json) => okApi(provider.token, "POST", `/api/episodes/${epId}/charges`, body);

  // D opens first so its 30-minute expiry runs while A, B, C and E happen.
  let dEpisode: Awaited<ReturnType<typeof episode>> | null = null;
  await scenario("D. setup (funded, then left to expire)", async () => {
    dEpisode = await episode("D", { capPct: 50 });
  });

  await scenario("A. Happy path", async () => {
    const { epId } = await episode("A", { capPct: 50 });
    const notes: Record<string, string> = { "CON-01": "Initial consultation and treatment plan", "IMP-01": "First implant placed, lower left molar", "XR-01": "Panoramic X-ray before surgery" };
    for (const code of ["CON-01", "IMP-01", "XR-01"]) {
      const r = await charge(epId, { priceItemId: id(code), quantity: 1, description: notes[code] });
      assert.equal(r.charge.status, "paid", `${code}: ${r.decision?.reason}`);
      log("A", `${code} paid (Groq: “${r.decision.reason}”)`, r.charge.tx_hash);
    }
    const res = await okApi(provider.token, "POST", `/api/episodes/${epId}/discharge`, {});
    log("A", "discharge + refunds", res.txHash);
    const view = await okApi(provider.token, "GET", `/api/episodes/${epId}`);
    assert.equal(view.episode.status, "closed");
    assert.ok((view.decisions as Json[]).every((d) => d.tx_hash), "every decision hash is onchain");
  });

  await scenario("B. Escalation: approve, then reject", async () => {
    const { epId } = await episode("B", { capPct: 25 }); // cap 0.17 < implant 0.20
    const first = await charge(epId, { priceItemId: id("IMP-01"), quantity: 1, description: "First implant placed, lower left molar" });
    assert.equal(first.charge.status, "escalated", first.decision?.reason);
    const queue = (await okApi(approver.token, "GET", "/api/approvals")) as unknown as Json[];
    const item = queue.find((q) => q.charge.id === first.charge.id)!;
    const m = item.request.message;
    const signature = await createWalletClient({ account: approverAccount, chain: arc, transport: http() }).signTypedData({
      domain: { ...item.request.domain, chainId: Number(item.request.domain.chainId) },
      types: item.request.types,
      primaryType: "ApproveCharge",
      message: { episodeId: BigInt(m.episodeId), chargeHash: m.chargeHash, amount: BigInt(m.amount), coveredAmount: BigInt(m.coveredAmount), deadline: BigInt(m.deadline) },
    });
    const approved = await okApi(approver.token, "POST", `/api/approvals/${first.charge.id}`, { verdict: "approve", signature, deadline: m.deadline });
    assert.equal(approved.status, "paid");
    log("B", "payChargeApproved (approver signature)", approved.tx_hash);
    const second = await charge(epId, { priceItemId: id("IMP-01"), quantity: 1, description: "Second implant placed, lower right molar" });
    assert.equal(second.charge.status, "escalated");
    const rejected = await okApi(approver.token, "POST", `/api/approvals/${second.charge.id}`, { verdict: "reject", reason: "Second implant not yet scheduled." });
    assert.equal(rejected.status, "rejected");
  });

  await scenario("C. Margin call, then top-up", async () => {
    const { epId } = await episode("C", { capPct: 50, family: 0.05, familyExtra: 0.4 });
    const r = await charge(epId, { priceItemId: id("CON-01"), quantity: 1, description: "Initial consultation and treatment plan" });
    assert.equal(r.charge.status, "waiting", r.decision?.reason);
    log("C", "raiseMarginCall", await lastTx(epId, "margin_call"));
    await okApi(family.token, "POST", `/api/episodes/${epId}/fund`, { amount: "0.20" });
    log("C", "family top-up", await lastTx(epId, "fund"));
    const view = await okApi(provider.token, "GET", `/api/episodes/${epId}`);
    const paid = (view.charges as Json[])[0];
    assert.equal(paid.status, "paid", "waiting charge paid after the top-up");
    log("C", "waiting charge paid", paid.tx_hash);
  });

  await scenario("E. Abuse", async () => {
    const { epId, contractId } = await episode("E", { capPct: 50 });
    const first = await charge(epId, { priceItemId: id("CON-01"), quantity: 1, description: "Initial consultation and treatment plan" });
    assert.equal(first.charge.status, "paid", first.decision?.reason);
    log("E", "first consultation paid", first.charge.tx_hash);
    const dup = await charge(epId, { priceItemId: id("CON-01"), quantity: 1, description: "Initial consultation and treatment plan" });
    assert.equal(dup.charge.status, "escalated");
    assert.match(dup.decision.reason, /Possible duplicate/);
    await assert.rejects(
      publicClient.simulateContract({ ...careGuard, account: agentSigner().address, functionName: "payCharge", args: [contractId, first.charge.hash as Hex, u(0.1), 0n] }),
      /ChargeAlreadyUsed/,
    );
    const queue = (await okApi(approver.token, "GET", "/api/approvals")) as unknown as Json[];
    const item = queue.find((q) => q.charge.id === dup.charge.id)!;
    const m = item.request.message;
    const tampered = await createWalletClient({ account: approverAccount, chain: arc, transport: http() }).signTypedData({
      domain: { ...item.request.domain, chainId: Number(item.request.domain.chainId) },
      types: item.request.types,
      primaryType: "ApproveCharge",
      message: { episodeId: BigInt(m.episodeId), chargeHash: m.chargeHash, amount: BigInt(m.amount) + 1n, coveredAmount: BigInt(m.coveredAmount), deadline: BigInt(m.deadline) },
    });
    const r = await api(approver.token, "POST", `/api/approvals/${dup.charge.id}`, { verdict: "approve", signature: tampered, deadline: m.deadline });
    assert.equal(r.status, 403, r.json.error);
    const offList = await charge(epId, { priceItemId: null, amount: "0.08", description: "Lab fee for crown" });
    assert.equal(offList.charge.status, "escalated");
  });

  await scenario("D. Agent offline: payer refunds after expiry without our server", async () => {
    assert.ok(dEpisode, "D setup failed");
    const ep = dEpisode!;
    const onchain = await publicClient.readContract({ ...careGuard, functionName: "getEpisode", args: [ep.contractId] });
    process.stdout.write(`     waiting for expiry at ${new Date(Number(onchain.expiresAt) * 1000).toLocaleTimeString()}`);
    while ((await publicClient.getBlock()).timestamp < onchain.expiresAt) {
      await delay(20_000);
      process.stdout.write(".");
    }
    console.log();
    // The family payer calls the contract from their own wallet; our API is not involved.
    const before = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [ep.payers.family.wallet_address] });
    const hash = await send({ address: ep.payers.family.wallet_address, walletId: ep.payers.family.wallet_id }, { ...careGuard, functionName: "refundExpired", args: [ep.contractId] });
    log("D", "refundExpired called by the family payer", hash);
    const after = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [ep.payers.family.wallet_address] });
    assert.ok(after > before, "family got its balance back (net of gas)");
    execSync("npm run indexer", { stdio: "pipe", env: process.env });
    const { data } = await admin.from("episodes").select("status").eq("id", ep.epId).single();
    assert.equal(data!.status, "expired", "indexer caught the refund");
  });

  const failed = results.filter((r) => !r.ok);
  const report = [
    `# Arc Testnet run, ${new Date().toISOString()}`,
    `Contract ${config.contractAddress}. ${results.length - failed.length}/${results.length} passed.`,
    ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.note ? ` — ${r.note}` : ""}`),
    ...Object.entries(links).flatMap(([s, l]) => (l.length ? [`\n## Scenario ${s}`, ...l] : [])),
  ].join("\n");
  writeFileSync("secrets/testnet-run.md", report + "\n");
  console.log(`\n${report}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
