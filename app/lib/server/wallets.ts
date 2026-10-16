import type { Address } from "viem";
import { ANVIL, anvilAccount, circleClient, type Signer } from "./chain";
import { circleBlockchain, isLocal, need } from "./env";
import { UserError } from "./errors";

export type WalletRole = "provider" | "coverer" | "family";

/**
 * Creates a Circle developer-controlled wallet for a provider or payer (custodial: noted in the README).
 * Locally, each role maps to a fixed anvil account that DeployLocal funds with mock USDC.
 */
export async function createWallet(role: WalletRole, refId: string): Promise<Signer> {
  if (isLocal) return { address: anvilAccount(ANVIL[role]).address, walletId: null };

  const res = await circleClient().createWallets({
    walletSetId: need("CIRCLE_WALLET_SET_ID"),
    blockchains: [circleBlockchain()],
    count: 1,
    accountType: "EOA", // Arc pays gas in USDC, so an EOA needs no separate gas token
    metadata: [{ name: role, refId }],
  });
  const w = res.data?.wallets?.[0];
  if (!w?.id || !w.address) throw new UserError("Couldn't create a wallet. Try again in a moment.", 502);
  return { address: w.address as Address, walletId: w.id };
}
