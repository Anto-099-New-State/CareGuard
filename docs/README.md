# CareGuard (working name)

**Multi-payer USDC escrow for medical treatment, paid per charge by an AI agent, settled on Arc.**

Before treatment, the people paying for it (an insurer or employer, and family) fund one episode in USDC or EURC. The provider sees the money is committed and starts treating. Each charge the provider submits is reviewed by our agent and paid within seconds:

| Agent decision | When | What happens to the money |
|---|---|---|
| **Pay** | Charge is on the provider's price list and under the per-charge cap | Paid to the provider, covered part from the coverer, rest from family |
| **Escalate** | Over the cap, not on the price list, or a possible duplicate | Held until our human approver signs |
| **Margin call** | Remaining funds won't cover expected remaining cost | Payer asked to top up; charges wait |
| **Discharge** | Treatment ends | Everything left returns to each payer |
| *(agent silent)* | Episode passes its expiry | Anyone can trigger the refund |

## Why this exists

- A patient treated abroad meets a standoff: the hospital wants money first, the payer wants treatment first.
- Today it's settled with paper Guarantee of Payment letters that arrive late, or with upfront wires from family in several currencies, refunded weeks later.
- Existing escrow startups (Flymedi, Medush) only hold one payer's money until treatment. Nobody pays per charge, splits it across payers, and refunds the rest automatically.

We replace the letter and the wire with committed funds the provider can see, released one charge at a time.

## The docs

Read them in this order:

| File | What it covers | Main reader |
|---|---|---|
| [FLOW.md](FLOW.md) | Who does what, the episode lifecycle, and step-by-step flows | Both |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The contract, the agent and API, the frontend, and how they connect | Both (backend → Clatson, frontend → Anto) |
| [NETWORKS.md](NETWORKS.md) | Testnet vs. mainnet, config, wallets and safety rules | Both |
| [TESTING.md](TESTING.md) | Contract tests, local tests, testnet scenarios, mainnet smoke test, sign-off | Both |
| [DESIGN.md](DESIGN.md) | Visual theme, references, screens and UI states | Anto |

## Who owns what

| Part | Owner |
|---|---|
| Contract, agent, API, database, wallets, swap | **Clatson** (backend) |
| Every screen, realtime updates, deploy, demo video, root README | **Anto** (frontend) |
| Finding the real provider and payers, running the real sessions | Both |

## Decisions already made

- **The contract holds all money.** Funds can go only to the episode's provider (charges) or back to the payer who sent them (refunds). No admin withdrawal.
- **The agent decides inside limits the contract enforces.** It can't pay above the per-charge cap without the approver's signature, can't pay anyone but the provider, and can't pay the same charge twice.
- **Two payer slots per episode in v1:** a **coverer** (insurer, employer, or a relative paying covered items) and a **family** payer (everything else).
- **USDC is the holding currency.** EURC is swapped to USDC when a payer funds. The provider is paid in USDC.
- **No medical data onchain.** Only salted hashes of charges and decisions. Descriptions stay in the database, visible only to the provider and approver.
- **No synthetic data.** No seed scripts, sample episodes or invented price lists. Every episode comes from a real provider and real payers. Our own test runs are flagged and excluded from traction numbers.
- **Cost sizing uses the provider's own quote and price list**, plus a stated contingency, because we have no cost history yet.

## Open decisions

These still need both of us. Defaults are in brackets.

- [ ] Contingency added to the quote when sizing [20%]
- [ ] Default per-charge cap [25% of the guarantee]
- [ ] Episode expiry [30 days; 30 minutes on testnet]
- [ ] Margin call threshold [remaining funds < expected remaining cost]
- [ ] Payers: Circle wallets we create, or their own wallets? [Circle developer-controlled wallets for the demo; noted as custodial in the README]

## Out of scope for the hackathon (roadmap)

Guarantor pool and risk-priced guarantee fees, more than two payers per episode, StableFX and local stablecoins beyond EURC, paying providers in their local currency, payer reliability scoring, ZK coverage proofs, Lit + IPFS encrypted records, ERC-8004 agent identity, insurer integrations.
