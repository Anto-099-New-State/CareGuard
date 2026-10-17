# Design

## Theme: the itemised bill

Our promise is that every dollar of a treatment is accounted for: who paid it, what it paid for, and why the agent let it through. The interface should read like the clearest hospital bill you've ever seen: **calm, itemised and exact**. A good bank statement crossed with a patient chart, never a crypto app.

- **Calm:** neutral surfaces, generous spacing, one accent colour. Patients and families are stressed; nothing should feel urgent unless it is.
- **Itemised:** every charge is a line with its amount, who paid which part, and a link to the transaction.
- **Exact:** money always appears the same way, in the same place, in a monospace font.

## References

For feel and structure, not to copy.

| Reference | Look at | Take from it |
|---|---|---|
| [Stripe](https://stripe.com) | Payment detail pages | How to show a payment's history and splits so people trust it. Model the episode page on this. |
| [Mercury](https://mercury.com) | Banking dashboard | Quiet confidence with balances; almost no decoration. |
| [Linear](https://linear.app) | Triage views | Fast, keyboard-friendly review. Model the approver queue on this. |
| [One Medical](https://www.onemedical.com) | Patient-facing screens | Warm, plain language around health without looking clinical. |
| Dribbble: [medical billing](https://dribbble.com/search/medical-billing), [escrow](https://dribbble.com/search/escrow) | Concepts | Ideas for charge lists, split bars and empty states. |

## Visual system

The look comes from the CareGuard UI reference canvas (landing page and facilitator dashboard). Tokens live in `app/app/globals.css`.

### Colour

Each colour means one thing.

| Role | Use | Light / dark |
|---|---|---|
| Ink | Text | `#111114` / `#F3F2EE` |
| Background, surface | Page, cards, quiet panels | White and warm cream `#F5F4F1` / graphite `#0C0C10`, `#15151B` |
| Accent | Primary buttons, brand mark | Soft purple `#9C8CFF` with dark ink on it |
| Strong | Links, active nav, the coverer part of a split bar | Deep purple `#4F3BD6` / `#BBAFFF` |
| Paid | Paid charges, refunds, funded | Green |
| Waiting | Funding pending, escalations, margin calls | Amber |
| Rejected | Rejected charges only | Red, used nowhere else |
| Coverer / Family | The two parts of a split bar | Strong purple / accent purple, always labelled |
| Testnet | The testnet banner | Pale purple band |

Never colour alone: every status also has a text label and an icon.

### Type
- **Headings and hero numbers:** Bricolage Grotesque, tight tracking.
- **Interface text and amounts:** Figtree (open, large x-height, readable at small sizes on phones), with tabular figures so digits line up. Smallest text 13px, body 16-17px.
- **Hashes and addresses only:** IBM Plex Mono.
- Amounts always as `125.00 USDC`, with the currency as a small muted suffix. EURC shown as `120.00 EURC → 129.60 USDC` when swapped.

### Shape and motion
- Rounded cards (16px), pill buttons and pills for status, 1px borders. Shadows only on dialogs and the hero card.
- Motion only to show state changes (a charge turning Paid, a timeline step filling in) and gentle entrances; everything respects reduced motion.
- Pages are fluid: tables become cards on phones, the sidebar becomes a menu.

## Key screens

### Payer funding page (first impression for family)

```text
┌──────────────────────────────────────────────────┐
│ Treatment at City Dental · for Maria L.            │
│                                                  │
│ Your share      600.00 USDC   non-covered items   │
│ Unused money    returned automatically at the end │
│ Safety net      refundable by you after 14 Nov    │
│                                                  │
│ Pay in  (•) EURC  ( ) USDC                        │
│ [ Fund my share ]                                 │
│                                                  │
│ How it works ▸   What you'll pay for ▸            │
└──────────────────────────────────────────────────┘
```

Three lines answer a family's three questions: how much, what happens to leftovers, what if something goes wrong.

### Provider episode page

```text
Episode #7 · Maria L. · implant + crown              [ Active ]
──────────────────────────────────────────────────────────────
Guarantee 1,800.00   Held 1,240.00   Paid 560.00   Cap 450.00

Charges
#1 Consultation        80.00  ▓▓▓▓▓▓▓▓ coverer      Paid ↗
#2 CT scan            180.00  ▓▓▓▓▓░░░ coverer/fam  Paid ↗
#3 Implant surgery    300.00  ▓▓░░░░░░ coverer/fam  Paid ↗
#4 Bone graft         520.00                         Waiting for approval

[ Submit a charge ]                            [ Discharge ]
```

### Decision log

```text
14:02  Sized guarantee at 1,800.00 USDC
       Quote 1,500.00 + 20% contingency. No cost history yet.   ↗
14:40  Paid #3 Implant surgery, 300.00
       On price list (IMP-01). 220.00 covered, 80.00 family.    ↗
15:05  Escalated #4 Bone graft, 520.00
       Above the 450.00 per-charge cap. Not in the quote.        ↗
```

Every entry: time, outcome in a few words, reason in one plain sentence, explorer link. This is the screen to show judges.

### Approver queue
- A Linear-style list: charge, episode, amount, agent's reason, age.
- Two buttons: **Approve** and **Reject** (reject asks for a one-line reason).
- Before signing, one sentence states the consequence: "Approve #4: pay City Dental 520.00 USDC, 300.00 from the insurer and 220.00 from family."

## States to design

- **Empty:** no price list yet, no episodes yet, nothing to approve ("Nothing waiting for you."). Never fill with sample data.
- **Funding:** one payer funded, both funded, swap in progress.
- **Transaction:** pending, confirmed with link, failed with a plain reason ("Family balance is 40.00 USDC short of this charge").
- **Margin call:** a banner on the payer's page with amount, reason and a Top up button.
- **Expired:** the refund button becomes active, with a short explanation.
- **Testnet:** a banner on every page.

## Accessibility and mobile
- Text contrast at least 4.5:1 in both themes.
- Everything reachable by keyboard, with visible focus.
- Payer pages designed phone-first: families often fund from a phone abroad.

## For the demo video
- Light mode for recording.
- Show the real provider submitting a charge, the decision log entry appearing, and the explorer link opening on Arc.
