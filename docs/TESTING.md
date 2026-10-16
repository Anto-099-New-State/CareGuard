# Testing

Four layers, each catching what the one before can't. Move on only when the current layer is green.

| Layer | Where | Speed | Catches | Owner |
|---|---|---|---|---|
| 1. Unit, fuzz, invariant | Foundry, local chain | Seconds | Logic and security bugs in the contract | Clatson |
| 2. Local end-to-end | App + agent against `anvil` | Minutes | Wiring bugs between screens, API, agent and contract | Anto |
| 3. Testnet scenarios | Arc Testnet, our own wallets | Hours | Circle wallets, swap, Arc RPC, real signatures | Both |
| 4. Mainnet smoke test | Arc Mainnet, tiny real USDC | One session | Anything different in production | Both |

Test fixtures stay in tests. Nothing from layers 1–3 is shown as traction.

---

## Layer 1: Contract tests (Foundry)

Use a mock ERC-20 with 6 decimals for USDC, `vm.sign` for approver signatures and `vm.warp` for expiry.

### Must pass

**Funding**
- [ ] Coverer and family can fund; balances update; `Funded` emitted
- [ ] A stranger can't fund
- [ ] Funding a closed or expired episode reverts
- [ ] Funding during MarginCall sets status back to Active

**Charges**
- [ ] Charge under cap pays the provider; covered part from coverer, rest from family
- [ ] Only the agent can pay a charge
- [ ] Charge above the cap reverts without a signature
- [ ] `coveredAmount > amount` reverts
- [ ] Not enough in either balance reverts, and nothing moves
- [ ] Same charge hash twice reverts
- [ ] Charge after expiry reverts

**Approvals**
- [ ] Valid approver signature pays an over-cap charge
- [ ] Signature from anyone else reverts
- [ ] Changing any signed field (amount, covered, charge hash, episode) reverts
- [ ] Expired deadline reverts
- [ ] Signature for another chain ID or contract reverts

**Refunds**
- [ ] Discharge returns each payer exactly their remaining balance
- [ ] Only the agent can discharge
- [ ] `refundExpired` one second before expiry reverts; at expiry, called by a stranger, refunds both payers
- [ ] Nothing can be paid or refunded after Closed or Expired

### Fuzz
Random funding, charges and covered splits never pay out more than came in, and never take from one payer more than they funded.

### Invariant
At all times:

```text
USDC balance of contract == sum over open episodes of (covererBalance + familyBalance)
```

If this breaks, money was created or lost. Run `forge coverage`; cover every branch of `payCharge`, `payChargeApproved`, `discharge` and `refundExpired`.

---

## Layer 2: Local end-to-end

1. Start `anvil`, deploy a mock USDC and the contract, write `config/local.json`.
2. Run the app and agent against it with your own test accounts.
3. Walk scenarios A–E by hand; use `evm_increaseTime` for expiry.

---

## Layer 3: Testnet scenarios (Arc Testnet)

**Setup:** 30-minute expiry; our own wallets as provider, coverer, family and approver, funded from the faucet; one price list entered by hand.

Record every transaction link in the sign-off table. Mark these episodes `is_internal_test`.

### A. Happy path
1. Provider creates an episode from a quote; agent sizes it and explains why.
2. Coverer funds in USDC, family funds in EURC (swapped).
3. Provider submits three charges on the price list.
4. Provider discharges.

**Expect:** three `ChargePaid` with correct splits; refunds equal to each payer's remaining balance; decision log has one entry per step.

### B. Escalation
A charge over the cap. **Expect:** status escalated, nothing paid. Approver signs; charge paid. Second run: approver rejects; nothing paid, provider sees the reason.

### C. Margin call
Charges that eat most of the funds. **Expect:** `MarginCall` to the right payer with an amount and reason; next charge waits; after top-up it's paid.

### D. Agent offline
1. Fund an episode.
2. **Stop the backend.**
3. Wait past expiry.
4. A payer calls `refundExpired` from the explorer.

**Expect:** both payers get their full balances back without our server.

### E. Abuse
1. Submit the same charge twice. **Expect:** second one rejected by the agent and reverts onchain.
2. Change the amount on a signed approval. **Expect:** revert.
3. Submit a charge not on the price list. **Expect:** escalated, not paid.

---

## Layer 4: Mainnet smoke test

**Before deploying**
- [ ] Git tag of the commit that passed testnet
- [ ] Fresh agent wallet and approver key
- [ ] `eth_chainId` returns 5042
- [ ] Minimum USDC in place

**Run (with the real provider and payers, with their consent)**
- [ ] Deploy; record address and link
- [ ] One episode, tiny amounts: fund, one or two charges, discharge
- [ ] Every link recorded

**Stop immediately if** any balance differs from what's expected.

---

## Sign-off table

| Scenario | Local | Testnet tx links | Mainnet tx links | Passed by |
|---|---|---|---|---|
| A. Happy path | ☐ | | | |
| B. Escalation | ☐ | | n/a | |
| C. Margin call | ☐ | | n/a | |
| D. Agent offline | ☐ | | | |
| E. Abuse | ☐ | | n/a | |

## Bug report template

```text
Scenario:        (A–E)
Network:         local / testnet / mainnet
What I did:
What I expected:
What happened:
Tx link:
Owner:           Clatson (contract/agent/API) / Anto (frontend)
```
