/**
 * One-time Circle setup for testnet (or mainnet). Needs CIRCLE_API_KEY in app/.env.
 *   npm run circle:setup
 *
 * 1. Generates a 32-byte entity secret, registers it with Circle, saves the recovery file to ./circle-recovery/
 *    and appends CIRCLE_ENTITY_SECRET to .env (skipped if it's already set).
 * 2. Creates a wallet set and the agent's wallet, and appends CIRCLE_WALLET_SET_ID, AGENT_WALLET_ID,
 *    AGENT_ADDRESS and NEXT_PUBLIC_AGENT_ADDRESS to .env (skipped if already set).
 * Never commit .env or the recovery file. Keep the recovery file somewhere safe: it's the only way back
 * if the entity secret is lost.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient, registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { config } from "../lib/config";
import { circleBlockchain } from "../lib/server/env";

const ENV = ".env";
const save = (key: string, value: string) => {
  appendFileSync(ENV, `\n${key}=${value}`);
  process.env[key] = value;
};

async function main() {
  if (config.network === "local") throw new Error("Set NEXT_PUBLIC_NETWORK=testnet (or mainnet) for Circle setup; local uses anvil accounts.");
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY is missing. Create one at https://console.circle.com/ (API & Client Keys) and add it to app/.env.");

  if (!process.env.CIRCLE_ENTITY_SECRET) {
    const entitySecret = randomBytes(32).toString("hex");
    mkdirSync("circle-recovery", { recursive: true });
    await registerEntitySecretCiphertext({ apiKey, entitySecret, recoveryFileDownloadPath: "./circle-recovery" });
    save("CIRCLE_ENTITY_SECRET", entitySecret);
    console.log("Registered a new entity secret. Recovery file saved in app/circle-recovery/ — move it somewhere safe.");
  } else {
    console.log("CIRCLE_ENTITY_SECRET already set; not generating a new one.");
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret: process.env.CIRCLE_ENTITY_SECRET! });

  if (!process.env.CIRCLE_WALLET_SET_ID) {
    const set = await client.createWalletSet({ name: `CareGuard ${config.network}` });
    const id = set.data?.walletSet?.id;
    if (!id) throw new Error("Circle didn't return a wallet set ID.");
    save("CIRCLE_WALLET_SET_ID", id);
    console.log(`Created wallet set ${id}.`);
  }

  if (!process.env.AGENT_WALLET_ID) {
    const res = await client.createWallets({
      walletSetId: process.env.CIRCLE_WALLET_SET_ID!,
      blockchains: [circleBlockchain()],
      count: 1,
      accountType: "EOA",
      metadata: [{ name: "agent", refId: "careguard-agent" }],
    });
    const w = res.data?.wallets?.[0];
    if (!w?.id || !w.address) throw new Error("Circle didn't return the agent wallet.");
    save("AGENT_WALLET_ID", w.id);
    save("AGENT_ADDRESS", w.address);
    save("NEXT_PUBLIC_AGENT_ADDRESS", w.address);
    console.log(`Created agent wallet ${w.address}.`);
  }

  console.log(`\nNext: send the agent a little ${config.network} USDC for gas (https://faucet.circle.com, Arc Testnet), then deploy the contract with AGENT_ADDRESS=${process.env.AGENT_ADDRESS}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
