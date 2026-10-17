/** Local only: signs in an anvil account with Sign-In with Ethereum and prints its access token, for curl-testing. */
import { createClient } from "@supabase/supabase-js";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { config } from "../lib/config";
import { anvilAccount } from "../lib/server/chain";

if (config.network !== "local") throw new Error("dev-token is for the local network only.");
const index = Number(process.argv[2] ?? 3); // 2 approver, 3 provider, 4 coverer, 5 family
const account = anvilAccount(index);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const message = createSiweMessage({ domain: "localhost:3000", address: account.address, statement: "Sign in to CareGuard.", uri: "http://localhost:3000", version: "1", chainId: config.chainId, nonce: generateSiweNonce(), issuedAt: new Date() });
account.signMessage({ message }).then(async (signature) => {
  const { data, error } = await anon.auth.signInWithWeb3({ chain: "ethereum", message, signature });
  if (error) throw error;
  process.stdout.write(data.session!.access_token);
});
