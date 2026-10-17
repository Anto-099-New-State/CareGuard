"use client";

import { createWalletClient, custom, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { arc, publicClient } from "../chains";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export class WalletError extends Error {}

/** Connects the browser wallet and makes sure it's on Arc (adding the network if the wallet doesn't know it). */
export async function connectWallet(): Promise<{ wallet: WalletClient; address: Address }> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new WalletError("No wallet found in this browser. Install MetaMask (or another Ethereum wallet) and try again.");
  }
  const wallet = createWalletClient({ chain: arc, transport: custom(window.ethereum) });
  let address: Address;
  try {
    [address] = await wallet.requestAddresses();
  } catch {
    throw new WalletError("The wallet didn't connect. Approve the connection in your wallet to continue.");
  }
  if (!address) throw new WalletError("The wallet returned no account.");
  if ((await wallet.getChainId()) !== arc.id) {
    try {
      await wallet.switchChain({ id: arc.id });
    } catch {
      try {
        await wallet.addChain({ chain: arc });
      } catch {
        throw new WalletError(`Switch your wallet to ${arc.name} to continue.`);
      }
    }
  }
  return { wallet, address };
}

/** Plain message for the common wallet failures (rejected request, not enough funds). */
export function walletMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (err instanceof WalletError) return text;
  if (/user (rejected|denied)|rejected the request/i.test(text)) return "You cancelled the request in your wallet. Nothing was sent.";
  if (/insufficient funds/i.test(text)) return "Your wallet doesn't hold enough USDC for this and the network fee. Arc fees are paid in USDC.";
  return text.split("\n")[0];
}

export { publicClient };
