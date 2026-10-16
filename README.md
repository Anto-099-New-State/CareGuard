# CareGuard

Multi-payer USDC escrow for medical treatment, paid per charge by an AI agent, settled on Arc.

Start with [docs/README.md](docs/README.md) for the product, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the parts fit.

## Layout

```text
app/        Next.js frontend and API routes
config/     testnet.json, mainnet.json (one shape for both networks)
docs/       product, flow, architecture, design and testing docs
contracts/  Foundry project (not added yet)
```

## Run the app

```bash
cd app
cp .env.example .env.local   # NEXT_PUBLIC_NETWORK=testnet by default
npm install
npm run dev                  # http://localhost:3000
```

Pages so far: `/` (landing) and `/dashboard` (provider dashboard). The dashboard shows empty states until the API exists; the app never shows sample data.
