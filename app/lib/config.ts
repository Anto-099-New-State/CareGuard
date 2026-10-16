import testnet from "../../config/testnet.json";
import mainnet from "../../config/mainnet.json";

export type NetworkConfig = {
  network: "testnet" | "mainnet";
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  usdc: `0x${string}`;
  eurc: `0x${string}`;
  contractAddress: `0x${string}`;
  deployBlock: number;
  isTestnet: boolean;
};

const configs = { testnet, mainnet } as Record<string, NetworkConfig>;

// NEXT_PUBLIC_ so the browser bundle knows which network it is showing.
const name = process.env.NEXT_PUBLIC_NETWORK ?? "testnet";

if (!configs[name]) {
  throw new Error(`Unknown NEXT_PUBLIC_NETWORK "${name}". Use "testnet" or "mainnet".`);
}

export const config: NetworkConfig = configs[name];

export const txUrl = (hash: string) => `${config.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string) => `${config.explorerUrl}/address/${address}`;
