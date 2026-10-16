# Testnet and mainnet

The same contract and app run on both. Only configuration changes. Testnet is where we break things for free; mainnet is where judges see real USDC move ("Real customers transacting in real USDC on mainnet count more").

## Network details

| | Arc Testnet | Arc Mainnet |
|---|---|---|
| Chain ID | `5042002` | `5042` (confirm, see below) |
| RPC | `https://rpc.testnet.arc.network` | `https://rpc.mainnet.arc.io` (confirm) |
| Explorer | `https://testnet.arcscan.app` | `explorer.arc.io` (confirm) |
| Gas token | USDC | USDC |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` | check Arc docs |
| EURC (ERC-20, 6 decimals) | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | check Arc docs |
| Getting funds | Free from `https://faucet.circle.com` (Arc Testnet) | Bridge real USDC to Arc (CCTP / Bridge Kit) |
| Money at risk | None | Real, so keep amounts tiny |

**Do this first (tonight):** send `eth_chainId` to the mainnet RPC (expect `0x13b2` = 5042), confirm the explorer, and confirm we can get a few USDC onto Arc mainnet. Wrong chain IDs for Arc circulate online; trust only what `eth_chainId` returns.

## What changes between networks

| Item | Testnet | Mainnet |
|---|---|---|
| Config file | `config/testnet.json` | `config/mainnet.json` |
| Contract address | Testnet deployment | Fresh deployment of the same commit |
| Agent wallet | Test Circle wallet | **New** wallet, ~1–2 USDC for gas |
| Approver key | Test key | **New** key, kept only by the approver |
| Episode expiry | **30 minutes** (so we can test refunds) | 1 day |
| Amounts | Real provider's prices, test USDC | Real provider's prices scaled down, or one real small charge (≈5 USDC) |
| UI banner | "Testnet: no real money" | none |
| Database | Separate | Separate |

Never reuse a testnet key on mainnet.

## One config shape for both

```json
{
  "network": "testnet",
  "chainId": 5042002,
  "rpcUrl": "https://rpc.testnet.arc.network",
  "explorerUrl": "https://testnet.arcscan.app",
  "usdc": "0x3600000000000000000000000000000000000000",
  "eurc": "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  "contractAddress": "0x…",
  "deployBlock": 0,
  "isTestnet": true
}
```

The app picks the file from `NETWORK=testnet|mainnet`. Secrets (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `KIT_KEY`, `LLM_API_KEY`, `SUPABASE_SECRET_KEY`) live only in the host's secret settings.

## Rules for mainnet

1. Don't deploy until every testnet scenario in [TESTING.md](TESTING.md) passes.
2. Deploy the exact commit that passed testnet, tagged `v0.1-testnet-passed`.
3. Tiny amounts only.
4. Real provider and real payers only, with their consent. No made-up episodes.
5. Record every transaction link for the README and submission.
6. If anything behaves differently from testnet, stop and reproduce it on testnet first.

## Real data vs. internal tests

- Episodes we create with our own wallets to test are marked `is_internal_test = true` and reset before real sessions.
- Traction numbers count only real providers and payers, on either network, and say which network each payment was on.
