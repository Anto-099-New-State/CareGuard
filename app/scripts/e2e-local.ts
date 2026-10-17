/**
 * TESTING.md layer 2: scenarios A–E against anvil + local Supabase + the running app.
 *
 *   anvil                                                     # terminal 1
 *   (cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast)
 *   npx supabase start                                        # from the repo root
 *   npm run dev                                               # terminal 2, with .env.local for NEXT_PUBLIC_NETWORK=local
 *   npm run e2e                                               # terminal 3
 *
 * Every episode it creates is marked is_internal_test. It uses test accounts on a local chain only.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createTestClient, createWalletClient, http, type Hex } from "viem";
import { foundry } from "viem/chains";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { careGuardAbi, erc20Abi } from "../lib/contract";
import { config } from "../lib/config";
import { ANVIL, anvilAccount } from "../lib/server/chain";

assert.equal(config.network, "local", "Run with NEXT_PUBLIC_NETWORK=local.");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const chain = { ...foundry, id: 31337 };
const pub = createPublicClient({ chain, transport: http(config.rpcUrl) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(config.rpcUrl) });
const cg = { address: config.contractAddress, abi: careGuardAbi } as const;
const usdcOf = (who: number) => pub.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [anvilAccount(who).address] });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Signs in with Sign-In with Ethereum using an anvil account, exactly as the browser does with a wallet. */
async function user(index: number): Promise<{ id: string; token: string; address: `0x${string}` }> {
  const account = anvilAccount(index);
  const message = createSiweMessage({
    domain: new URL(BASE).host,
    address: account.address,
    statement: "Sign in to CareGuard.",
    uri: BASE,
    version: "1",
    chainId: config.chainId,
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
  });
  const signature = await account.signMessage({ message });
  const { data, error } = await anon.auth.signInWithWeb3({ chain: "ethereum", message, signature });
  if (error) throw error;
  return { id: data.user!.id, token: data.session!.access_token, address: account.address };
}

/** The payer funds from their own wallet (approve + fund), then reports the transaction to the API. */
async function fundFrom(index: number, token: string, epId: string, contractId: bigint, amount: bigint) {
  const wallet = createWalletClient({ account: anvilAccount(index), chain, transport: http(config.rpcUrl) });
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: config.usdc, abi: erc20Abi, functionName: "approve", args: [cg.address, amount] }) });
  const hash = await wallet.writeContract({ ...cg, functionName: "fund", args: [contractId, amount] });
  await pub.waitForTransactionReceipt({ hash });
  return okApi(token, "POST", `/api/episodes/${epId}/fund`, { txHash: hash });
}

async function api(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

async function okApi(token: string | null, method: string, path: string, body?: unknown): Promise<Json> {
  const r = await api(token, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status}: ${r.json.error}`);
  return r.json;
}

const results: { name: string; ok: boolean; note?: string }[] = [];
async function scenario(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, ok: false, note: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL ${name}\n     ${err instanceof Error ? err.message : err}`);
  }
}

const big = (v: unknown) => BigInt(String(v));
const usd = (n: number) => BigInt(Math.round(n * 1e6));

async function main() {
  const provider = await user(ANVIL.provider);
  const coverer = await user(ANVIL.coverer);
  const family = await user(ANVIL.family);
  const approver = await user(ANVIL.approver); // recognised as approver because its key is the contract's approver

  await okApi(provider.token, "POST", "/api/profile", { role: "provider", name: "E2E Test Clinic" });
  await okApi(coverer.token, "POST", "/api/profile", { role: "patient", name: "Test Insurer" });
  await okApi(family.token, "POST", "/api/profile", { role: "patient", name: "Test Family" });
  const items = (await okApi(provider.token, "POST", "/api/price-list", {
    items: [
      { code: "CON-01", label: "Consultation", unitPrice: "80.00" },
      { code: "IMP-01", label: "Implant surgery", unitPrice: "300.00" },
      { code: "XR-01", label: "X-ray", unitPrice: "40.00" },
    ],
  })) as Json[];
  const id = (code: string) => items.find((i) => i.code === code)!.id as string;

  /** A funded episode: quote CON×1, IMP×2, XR×1 = 720.00, IMP 70% covered. */
  async function episode(opts: { capPct: number; fundCoverer?: string; fundFamily?: string }) {
    const created = await okApi(provider.token, "POST", "/api/episodes", {
      patientLabel: "E2E P.",
      description: "internal test",
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
    const withPayers = await okApi(provider.token, "POST", `/api/episodes/${epId}/payers`, {
      coverer: { wallet: coverer.address, name: "Test Insurer" },
      family: { wallet: family.address, name: "Test Family" },
    });
    const owed = { coverer: big(withPayers.payers.coverer.owed_usdc), family: big(withPayers.payers.family.owed_usdc) };
    const contractId = BigInt(withPayers.episode.contract_episode_id);
    if (opts.fundCoverer !== "0") await fundFrom(ANVIL.coverer, coverer.token, epId, contractId, opts.fundCoverer ? usd(Number(opts.fundCoverer)) : owed.coverer);
    if (opts.fundFamily !== "0") await fundFrom(ANVIL.family, family.token, epId, contractId, opts.fundFamily ? usd(Number(opts.fundFamily)) : owed.family);
    return { epId, contractId, created, owed };
  }

  const charge = (epId: string, body: Json) => okApi(provider.token, "POST", `/api/episodes/${epId}/charges`, body);

  await scenario("A. Happy path", async () => {
    const { epId, created, owed } = await episode({ capPct: 50 });
    assert.equal(created.sizing.reason, "Quote 720.00 + 20% contingency. No cost history yet. Per-charge cap 432.00 (50% of the guarantee).");
    assert.equal(big(owed.coverer) + big(owed.family), usd(864));

    const view0 = await okApi(family.token, "GET", `/api/episodes/${epId}`);
    assert.equal(view0.episode.status, "funded", "both payers funded → Funds committed");

    const paid: Json[] = [];
    for (const [code, q] of [["CON-01", 1], ["IMP-01", 1], ["XR-01", 1]] as const) {
      const r = await charge(epId, { priceItemId: id(code), quantity: q, description: "e2e" });
      assert.equal(r.charge.status, "paid", `${code}: ${r.decision?.reason}`);
      paid.push(r);
    }
    assert.equal(big(paid[1].charge.covered_usdc), usd(210), "70% of the implant from the coverer");

    const cBefore = await usdcOf(ANVIL.coverer);
    const fBefore = await usdcOf(ANVIL.family);
    const ep = (await okApi(provider.token, "GET", `/api/episodes/${epId}`)).episode;
    await okApi(provider.token, "POST", `/api/episodes/${epId}/discharge`);
    assert.equal((await usdcOf(ANVIL.coverer)) - cBefore, big(ep.coverer_balance), "coverer refund = remaining balance");
    assert.equal((await usdcOf(ANVIL.family)) - fBefore, big(ep.family_balance), "family refund = remaining balance");

    const view = await okApi(provider.token, "GET", `/api/episodes/${epId}`);
    assert.equal(view.episode.status, "closed");
    const kinds = (view.decisions as Json[]).map((d) => d.outcome);
    assert.deepEqual(kinds.filter((k) => k !== "margin_call"), ["sized", "pay", "pay", "pay", "discharge"]);
    assert.ok((view.decisions as Json[]).every((d) => d.tx_hash), "every decision hash is onchain");

    // Payers see amounts and categories, never descriptions or decision inputs.
    const payerView = await okApi(family.token, "GET", `/api/episodes/${epId}`);
    assert.ok((payerView.charges as Json[]).every((c) => !("description" in c)), "no descriptions for payers");
    assert.ok((payerView.decisions as Json[]).every((d) => !("inputs" in d)), "no decision inputs for payers");
    assert.equal(payerView.episode.description, undefined);
    assert.deepEqual((payerView.quote as Json[]).map((q) => q.label).sort(), ["Consultation", "Implant surgery", "X-ray"], "payers see the quoted items");
  });

  await scenario("B. Escalation: approve, then reject", async () => {
    const { epId } = await episode({ capPct: 25 }); // cap 216.00 < implant 300.00
    const first = await charge(epId, { priceItemId: id("IMP-01"), quantity: 1 });
    assert.equal(first.charge.status, "escalated");
    assert.match(first.decision.reason, /Above the 216\.00 per-charge cap/);

    const queue = (await okApi(approver.token, "GET", "/api/approvals")) as Json[];
    const item = queue.find((q) => q.charge.id === first.charge.id)!;
    assert.match(item.request.consequence, /^Approve charge #1: pay E2E Test Clinic 300\.00 USDC, 210\.00 from the coverer and 90\.00 from family\.$/);
    const m = item.request.message;
    const message = { episodeId: big(m.episodeId), chargeHash: m.chargeHash as Hex, amount: big(m.amount), coveredAmount: big(m.coveredAmount), deadline: big(m.deadline) };
    const signer = createWalletClient({ account: anvilAccount(ANVIL.approver), chain, transport: http(config.rpcUrl) });
    const signature = await signer.signTypedData({ domain: { ...item.request.domain, chainId: Number(item.request.domain.chainId) }, types: item.request.types, primaryType: "ApproveCharge", message });

    const before = await usdcOf(ANVIL.provider);
    const approved = await okApi(approver.token, "POST", `/api/approvals/${first.charge.id}`, { verdict: "approve", signature, deadline: m.deadline });
    assert.equal(approved.status, "paid");
    assert.equal((await usdcOf(ANVIL.provider)) - before, usd(300));

    const second = await charge(epId, { priceItemId: id("IMP-01"), quantity: 1 });
    assert.equal(second.charge.status, "escalated");
    const providerBefore = await usdcOf(ANVIL.provider);
    const rejected = await okApi(approver.token, "POST", `/api/approvals/${second.charge.id}`, { verdict: "reject", reason: "Second implant not yet scheduled." });
    assert.equal(rejected.status, "rejected");
    assert.equal(await usdcOf(ANVIL.provider), providerBefore, "nothing paid on reject");
    const view = await okApi(provider.token, "GET", `/api/episodes/${epId}`);
    assert.ok((view.decisions as Json[]).some((d) => d.reason === "Approver rejected #2: Second implant not yet scheduled."), "provider sees why");
  });

  await scenario("C. Margin call, then top-up", async () => {
    const { epId, contractId } = await episode({ capPct: 50, fundFamily: "10.00" });
    const r = await charge(epId, { priceItemId: id("CON-01"), quantity: 1 });
    assert.equal(r.charge.status, "waiting");
    assert.equal(r.decision.reason, "Family balance is 70.00 USDC short of this charge. Charge waits for a top-up.");
    const events = await pub.getContractEvents({ ...cg, eventName: "MarginCall", fromBlock: 0n });
    assert.ok(events.some((e) => e.args.payer === anvilAccount(ANVIL.family).address && e.args.amount === usd(70)), "MarginCall to family for 70.00");
    let view = await okApi(family.token, "GET", `/api/episodes/${epId}`);
    assert.equal(view.episode.status, "margin_call");

    await fundFrom(ANVIL.family, family.token, epId, contractId, usd(100));
    view = await okApi(provider.token, "GET", `/api/episodes/${epId}`);
    assert.equal((view.charges as Json[])[0].status, "paid", "waiting charge paid after the top-up");
  });

  await scenario("E. Abuse", async () => {
    const { epId, contractId } = await episode({ capPct: 50 });
    const first = await charge(epId, { priceItemId: id("CON-01"), quantity: 1 });
    assert.equal(first.charge.status, "paid");

    const dup = await charge(epId, { priceItemId: id("CON-01"), quantity: 1 });
    assert.equal(dup.charge.status, "escalated", "agent rejects the second consultation");
    assert.match(dup.decision.reason, /Possible duplicate/);

    // Replaying the paid charge hash onchain reverts.
    const agent = createWalletClient({ account: anvilAccount(ANVIL.agent), chain, transport: http(config.rpcUrl) });
    await assert.rejects(
      pub.simulateContract({ ...cg, account: agent.account, functionName: "payCharge", args: [contractId, first.charge.hash as Hex, usd(80), 0n] }),
      /ChargeAlreadyUsed/,
    );

    // A signed approval with a changed amount is refused.
    const queue = (await okApi(approver.token, "GET", "/api/approvals")) as Json[];
    const item = queue.find((q) => q.charge.id === dup.charge.id)!;
    const m = item.request.message;
    const signer = createWalletClient({ account: anvilAccount(ANVIL.approver), chain, transport: http(config.rpcUrl) });
    const tampered = await signer.signTypedData({
      domain: { ...item.request.domain, chainId: Number(item.request.domain.chainId) },
      types: item.request.types,
      primaryType: "ApproveCharge",
      message: { episodeId: big(m.episodeId), chargeHash: m.chargeHash, amount: big(m.amount) + 1n, coveredAmount: big(m.coveredAmount), deadline: big(m.deadline) },
    });
    const r = await api(approver.token, "POST", `/api/approvals/${dup.charge.id}`, { verdict: "approve", signature: tampered, deadline: m.deadline });
    assert.equal(r.status, 403, r.json.error);

    const offList = await charge(epId, { priceItemId: null, amount: "50.00", description: "e2e" });
    assert.equal(offList.charge.status, "escalated");
    assert.equal(offList.decision.reason, "Not on the provider's price list.");

    // A stranger can't read the episode or fund it.
    const stranger = await user(6);
    assert.equal((await api(stranger.token, "GET", `/api/episodes/${epId}`)).status, 404);
    assert.equal((await api(stranger.token, "POST", `/api/episodes/${epId}/fund`, { txHash: `0x${"ab".repeat(32)}` })).status, 403);
    // A real funding transaction can't be replayed to count twice.
    const fundTx = (await okApi(provider.token, "GET", `/api/episodes/${epId}`)).transactions.find((t: Json) => t.kind === "fund").tx_hash;
    const replay = await okApi(family.token, "POST", `/api/episodes/${epId}/fund`, { txHash: fundTx });
    assert.equal(replay.alreadyRecorded, true);
  });

  await scenario("D. Agent offline: payer refunds after expiry without our server", async () => {
    const { epId, contractId } = await episode({ capPct: 50 });
    const onchain = await pub.readContract({ ...cg, functionName: "getEpisode", args: [contractId] });
    const cBefore = await usdcOf(ANVIL.coverer);
    const fBefore = await usdcOf(ANVIL.family);

    await testClient.increaseTime({ seconds: 1_801 });
    await testClient.mine({ blocks: 1 });

    // The family payer calls the contract directly, as they would from the explorer.
    const payer = createWalletClient({ account: anvilAccount(ANVIL.family), chain, transport: http(config.rpcUrl) });
    const hash = await payer.writeContract({ ...cg, functionName: "refundExpired", args: [contractId] });
    await pub.waitForTransactionReceipt({ hash });
    assert.equal((await usdcOf(ANVIL.coverer)) - cBefore, onchain.covererBalance);
    assert.equal((await usdcOf(ANVIL.family)) - fBefore, onchain.familyBalance);

    // The indexer catches the cache up afterwards.
    const { execSync } = await import("node:child_process");
    execSync("npm run indexer", { stdio: "pipe" });
    const { data } = await admin.from("episodes").select("status, coverer_balance, family_balance").eq("id", epId).single();
    assert.deepEqual([data!.status, Number(data!.coverer_balance), Number(data!.family_balance)], ["expired", 0, 0]);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
