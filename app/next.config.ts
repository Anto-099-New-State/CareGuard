import path from "node:path";
import type { NextConfig } from "next";

// The repo root holds config/testnet.json and config/mainnet.json, shared with the contract and jobs.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
