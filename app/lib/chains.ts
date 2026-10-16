import { createPublicClient, defineChain, http } from "viem";
import { config } from "./config";

export const arc = defineChain({
  id: config.chainId,
  name: `Arc ${config.network}`,
  // Arc's native gas token is USDC with 18 decimals; the ERC-20 interface we use for money has 6.
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  blockExplorers: config.explorerUrl ? { default: { name: "Arc explorer", url: config.explorerUrl } } : undefined,
  testnet: config.isTestnet,
});

export const publicClient = createPublicClient({ chain: arc, transport: http(config.rpcUrl) });
