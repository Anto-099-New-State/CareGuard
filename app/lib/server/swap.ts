import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { AppKit, type SwapParams } from "@circle-fin/app-kit";
import type { Hash } from "viem";
import { formatAmount, parseAmount } from "../money";
import type { Signer } from "./chain";
import { appKitChain, isLocal, need } from "./env";
import { UserError } from "./errors";

export type SwapResult = { amountIn: bigint; amountOut: bigint; txHash: Hash };

/** Converts a payer's EURC to USDC in their own wallet with App Kit, before they fund. */
export async function swapEurcToUsdc(payer: Signer, amountIn: bigint): Promise<SwapResult> {
  if (isLocal) throw new UserError("EURC swaps need Arc Testnet; fund in USDC on the local chain.");

  const kit = new AppKit();
  const adapter = createCircleWalletsAdapter({ apiKey: need("CIRCLE_API_KEY"), entitySecret: need("CIRCLE_ENTITY_SECRET") });
  const params = {
    from: { adapter, chain: appKitChain(), address: payer.address },
    tokenIn: "EURC",
    tokenOut: "USDC",
    amountIn: formatAmount(amountIn).replace(/,/g, ""),
    config: process.env.KIT_KEY ? { apiKey: process.env.KIT_KEY } : undefined,
  } as unknown as SwapParams;

  let result: Awaited<ReturnType<AppKit["swap"]>>;
  try {
    result = await kit.swap(params);
  } catch (err) {
    throw new UserError(`The EURC to USDC swap didn't go through: ${err instanceof Error ? err.message : "unknown error"}.`, 502);
  }
  const r = result as unknown as { amountOut?: string; txHash?: string };
  if (!r.txHash || !r.amountOut) throw new UserError("The swap returned no transaction. Nothing was charged; try again.", 502);
  return { amountIn, amountOut: parseAmount(String(r.amountOut)), txHash: r.txHash as Hash };
}
