# CareGuard

Multi-payer USDC escrow for medical treatment, paid per charge by an AI agent, settled on Arc.

Start with [docs/README.md](docs/README.md) for the product, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the parts fit.

## Layout

```text
contracts/  Foundry: CareGuardEpisode.sol, tests, deploy scripts
supabase/   schema + row-level security (migrations/), PGlite RLS test (tests/)
app/        Next.js: pages, API routes (app/api), agent (lib/agent), services (lib/server), indexer (jobs/)
config/     testnet.json, mainnet.json (one shape for both networks)
docs/       product, flow, architecture, design and testing docs
```

## Tests

```bash
cd contracts && forge test            # unit, fuzz, invariant (49 tests)
cd supabase/tests && npm i && npm test # migration + RLS in PGlite
cd app && npm test                    # agent sizing/review and money (vitest)
```

## Run everything locally (TESTING.md layer 2)

Needs Foundry, Docker and Node 22.

```bash
anvil                                                    # terminal 1
cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
npx supabase start                                       # repo root; prints the local keys
cd app && cp .env.example .env.local                     # set NEXT_PUBLIC_NETWORK=local, the Supabase keys, AGENT_JUDGE=stub
npm install && npm run dev                               # terminal 2
npm run e2e                                              # terminal 3: scenarios A–E
npm run indexer -- --watch                               # optional: follow contract events
```

## Testnet

1. Create a Circle wallet set and an agent wallet; fund the agent with a little testnet USDC for gas (https://faucet.circle.com).
2. Deploy: `cd contracts && USDC_ADDRESS=0x3600000000000000000000000000000000000000 AGENT_ADDRESS=… APPROVER_ADDRESS=… forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --account <deployer>`.
3. Put the address and deploy block in `config/testnet.json`, push the migration to the hosted Supabase project, and fill `app/.env.local` from `.env.example`.

Everyone signs in with their own wallet (Sign-In with Ethereum). Hospitals are paid to it; patients and families fund and claim refunds from it. Only the agent uses a Circle wallet.

### Testnet scenarios (TESTING.md layer 3)

Run the app in testnet mode, then the scenarios. They use tiny amounts, real Circle wallets, real Groq review and the approver key in `app/secrets/approver-testnet.txt`; the run takes ~35 minutes because scenario D waits for the 30-minute expiry. Links are written to `app/secrets/testnet-run.md`.

```bash
cd app
NEXT_PUBLIC_NETWORK=testnet AGENT_JUDGE= npm run dev        # terminal 1
NEXT_PUBLIC_NETWORK=testnet AGENT_JUDGE= npm run e2e:testnet # terminal 2
NEXT_PUBLIC_NETWORK=testnet npm run sweep:testnet            # afterwards: discharge test episodes, return payer-wallet USDC to the agent
```

On Arc, network fees are paid in USDC from the same balance. A payer's wallet needs the amount plus about 0.25 USDC (`FEE_BUFFER_USDC`); the app checks this before funding.
