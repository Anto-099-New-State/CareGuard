"use client";

import { createPublicClient, http, type Hash } from "viem";
import { config } from "../config";
import { WalletError } from "./wallet";

/**
 * Currency conversion in the payer's own wallet, through Circle App Kit swap (keyless path, no API key in the browser).
 * The contract only holds USDC, so a payer who holds EURC converts just enough to cover their share, then funds in USDC.
 * App Kit is loaded on demand so it stays out of every other page's bundle.
 */

export type FxQuote = {
  amountIn: bigint; // EURC the payer spends
  estimatedOut: bigint; // USDC they should receive
  minOut: bigint; // USDC guaranteed, or the swap reverts
  rate: number; // USDC per 1 EURC, from the estimate
  provider: string;
};

const CHAIN = config.network === "mainnet" ? "Arc" : "Arc_Testnet";
export const fxAvailable = config.network !== "local";

/** "0.02700560625" -> units, truncated to 6 decimals (service amounts can carry more). */
function units(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt(frac.slice(0, 6).padEnd(6, "0"));
}
const decimal = (u: bigint) => `${u / 1_000_000n}.${(u % 1_000_000n).toString().padStart(6, "0")}`;
/** Round up to whole cents, so the amount reads cleanly in the wallet prompt. */
const ceilCents = (u: bigint) => ((u + 9_999n) / 10_000n) * 10_000n;

async function kit() {
  if (!fxAvailable) throw new WalletError("Currency conversion runs on Arc, not on the local test chain.");
  if (typeof window === "undefined" || !window.ethereum) throw new WalletError("No wallet found in this browser.");
  const [{ createContext }, { estimateSwap }, { swap }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit/context"),
    import("@circle-fin/app-kit/estimateSwap"),
    import("@circle-fin/app-kit/swap"),
    import("@circle-fin/adapter-viem-v2"),
  ]);
  // App Kit's built-in Arc RPC can lag behind; reads go through the same RPC as the rest of the app.
  const adapter = await createViemAdapterFromProvider({
    provider: window.ethereum,
    getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(chain.id === config.chainId ? config.rpcUrl : undefined) }),
  });
  const params = (amountIn: bigint) => ({ from: { adapter, chain: CHAIN }, tokenIn: "EURC", tokenOut: "USDC", amountIn: decimal(amountIn) }) as const;
  return { context: createContext(), estimateSwap, swap, params };
}

async function estimate(k: Awaited<ReturnType<typeof kit>>, amountIn: bigint): Promise<FxQuote> {
  const e = await k.estimateSwap(k.context, k.params(amountIn));
  const estimatedOut = units(e.estimatedOutput.amount);
  return {
    amountIn,
    estimatedOut,
    minOut: units(e.stopLimit.amount),
    rate: Number((estimatedOut * 1_000_000n) / amountIn) / 1_000_000,
    provider: (e as { route?: { provider?: string } }).route?.provider ?? "Circle",
  };
}

/** The smallest EURC amount whose guaranteed USDC output still covers `target`. */
export async function quoteEurcFor(target: bigint): Promise<FxQuote> {
  const k = await kit();
  let q = await estimate(k, target); // probe at 1:1 to learn the rate
  for (let i = 0; i < 3; i++) {
    const needed = ceilCents((q.amountIn * target * 1002n) / (q.minOut * 1000n));
    q = await estimate(k, needed);
    if (q.minOut >= target) return q;
  }
  throw new WalletError("Couldn't get a stable EURC price right now. Try again in a moment, or pay in USDC.");
}

/** Signs and sends the conversion from the payer's wallet. Returns the swap transaction. */
export async function convertEurc(amountIn: bigint): Promise<{ txHash: Hash; amountOut?: bigint }> {
  const k = await kit();
  const r = await k.swap(k.context, k.params(amountIn));
  return { txHash: r.txHash as Hash, amountOut: r.amountOut ? BigInt(r.amountOut) : undefined };
}
