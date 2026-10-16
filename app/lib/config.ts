import testnet from "../../config/testnet.json";
import mainnet from "../../config/mainnet.json";

export type NetworkName = "local" | "testnet" | "mainnet";

export type NetworkConfig = {
  network: NetworkName;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  usdc: `0x${string}`;
  eurc: `0x${string}`;
  contractAddress: `0x${string}`;
  deployBlock: number;
  isTestnet: boolean;
};

// Local anvil (TESTING.md layer 2). Addresses are deterministic for a fresh anvil + contracts/script/DeployLocal.s.sol.
const local: NetworkConfig = {
  network: "local",
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8545",
  explorerUrl: "",
  usdc: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  eurc: "0x0000000000000000000000000000000000000000",
  contractAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  deployBlock: 0,
  isTestnet: true,
};

const configs: Record<string, NetworkConfig> = {
  local,
  testnet: testnet as NetworkConfig,
  mainnet: mainnet as NetworkConfig,
};

// NEXT_PUBLIC_ so the browser bundle knows which network it is showing.
const name = process.env.NEXT_PUBLIC_NETWORK ?? "testnet";

if (!configs[name]) {
  throw new Error(`Unknown NEXT_PUBLIC_NETWORK "${name}". Use "local", "testnet" or "mainnet".`);
}

export const config: NetworkConfig = configs[name];

export const txUrl = (hash: string) => (config.explorerUrl ? `${config.explorerUrl}/tx/${hash}` : "");
export const addressUrl = (address: string) => (config.explorerUrl ? `${config.explorerUrl}/address/${address}` : "");
