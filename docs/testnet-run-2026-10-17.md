# Arc Testnet run, 2026-10-17

TESTING.md layer 3, run with `npm run e2e:testnet` against contract `0xF5444a52A7ffEa3664eE4ecD093E5Ae378f1F9F0`
(Circle developer-controlled wallets, Groq `openai/gpt-oss-120b` reviewing charges, approver signatures from a browser-style key).
Amounts are tiny (0.05–0.20 USDC); every episode is marked as an internal test.

| Scenario | Result | Notes |
|---|---|---|
| A. Happy path | PASS | Three charges paid by the agent after Groq review, then discharge with refunds |
| B. Escalation | PASS | Over-cap implant escalated, paid with the approver's EIP-712 signature; a second one rejected |
| C. Margin call | PASS | Charge waited on a margin call, paid automatically after the family topped up |
| D. Agent offline | PASS | The family payer called `refundExpired` from its own wallet after expiry; the indexer then caught up* |
| E. Abuse | PASS | Duplicate escalated, replayed hash reverts, tampered approval refused, off-list charge escalated |

\* The first indexer pass failed: Arc's RPC refuses an `eth_getLogs` filter that lists every event topic. The indexer now filters
by address only and decodes locally; rerun, it marked the episode expired with zero balances.

Found and fixed during this run: payer wallets need headroom for Arc fees (paid in USDC and reserved up front), so funding now
checks for the amount plus `FEE_BUFFER_USDC` and explains what to add.

## Scenario A
- createEpisode: https://explorer.testnet.arc.io/tx/0x089c89c6979a89d0d1d49e7ecfadb43bb9fecceaa63901f18c771419ca9fa3a4
- seed 0.69 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0x4a9dc12363e34fbbb5462fc4893fdca27e643f9864df3a2c944537706db0c26c
- seed 0.67 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0x5c7a920f37a51e66fa4d921e4fc4e9c3dcff5520d567d2727cd3d62d5fb48c50
- coverer fund: https://explorer.testnet.arc.io/tx/0xf2b0d7ecaaec117b2af5f958027cccbc094066732dece61c3323eace2a83ff11
- family fund: https://explorer.testnet.arc.io/tx/0xa7ae6b54df87da7330145d75a380b4719fe6e37ce385801b8d06fa6fb8ff35bf
- CON-01 paid (Groq: “On price list (CON-01). 0.00 covered, 0.10 family. CON-01 is not covered.”): https://explorer.testnet.arc.io/tx/0x87a0faff06011af54b2e9859a58c64fa1f4fb545e093316a2512cffe5a059269
- IMP-01 paid (Groq: “On price list (IMP-01). 0.14 covered, 0.06 family. Coverage applied to IMP-01 per policy.”): https://explorer.testnet.arc.io/tx/0xe6bd655379891d592670bad2b193d99961506f13f158223249a61ad943e35e05
- XR-01 paid (Groq: “On price list (XR-01). 0.00 covered, 0.05 family. XR-01 is not a covered code.”): https://explorer.testnet.arc.io/tx/0x5545cc8e000febb662e7ec432c0f9599730fcf71d26e00ef8916bae3a8b1b579
- discharge + refunds: https://explorer.testnet.arc.io/tx/0x8d9a4c79d71d6c24510d76dfb760cf74a8ba20e87162e847203148e6d2ea132f

## Scenario B
- createEpisode: https://explorer.testnet.arc.io/tx/0xb4f939707f24297595bd578a640ac7667b6b877a8244c6a98ac91f8dec838abf
- seed 0.69 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0xacbc5a70359d028dcb8abfc608b77baea056f9dd15f89be882428f0beb275672
- seed 0.67 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0x2e3df4258a047fe53f48830ecd63cc20d33c842e1d77bffe6979c985de7a7936
- coverer fund: https://explorer.testnet.arc.io/tx/0xdf875383ebe5951592a6bf020c807ff1225982fcfc774c35c75c85401597587d
- family fund: https://explorer.testnet.arc.io/tx/0x74232fecc220daa67e66da0179f69a5c665c8ebb2ffd3de511681dae4e035e06
- payChargeApproved (approver signature): https://explorer.testnet.arc.io/tx/0x395bc0479f20030cb6329f6e45d1597276fbb286dd8006225fa818382200e892

## Scenario C
- createEpisode: https://explorer.testnet.arc.io/tx/0x5bc10ddf7affa86939ecef1c14c2e13f93904335fe485f25f765e7abc6b24184
- seed 0.69 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0x02cd37796fb7c1d2469557720801947981ca6a7b10cd708133b0715aded837fd
- seed 0.80 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0xf8cd5a244990f806e6b89904ea4300fcc60522ba3ff3d8f05b4ca566a33e1fa9
- coverer fund: https://explorer.testnet.arc.io/tx/0xbdde6dacc9a02455339b63af647b4a69e2e387fae7e592c124e23762830a0154
- family fund: https://explorer.testnet.arc.io/tx/0x023c08bd7df86bb1c01cf4403e0d43d398e9a504b4dcafffe51a06e00a2524ca
- raiseMarginCall: https://explorer.testnet.arc.io/tx/0x3192ca58c9c66411e59622bdc44fe23a0e26f4661ae9121746f51f30b163bc7b
- family top-up: https://explorer.testnet.arc.io/tx/0xbc7215fb1e4ec9ac6abfbab6bbbe21eb58e3b3683f64f058b9273971036998c9
- waiting charge paid: https://explorer.testnet.arc.io/tx/0x4821700b7909039393859955c084c706f860416b395d02190d7b7bc4aeec3090

## Scenario D
- createEpisode: https://explorer.testnet.arc.io/tx/0xa5cc43ab7955a2253ed57cf0a95e7efa4609fc064fc0a923da6b1c34efaf6edf
- seed 0.69 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0x5fa51b5eeb06fc0f81b9e9497e14bc7a3ddc404f4478eef63ad928435c608777
- seed 0.67 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0xcc9f97f09b153e6a00cec528d758bd6b7ebfa7e55a2677dacefbdbff52c3170c
- coverer fund: https://explorer.testnet.arc.io/tx/0x7b28bb27032a4ce36eaf538035d508d369b2bfaadd8bf431aea506c3bedf2ba1
- family fund: https://explorer.testnet.arc.io/tx/0x3485edf1c94af810148e80892c1a2bac3bd2bf691c3f0e9202b8d42ad1d8405f
- refundExpired called by the family payer: https://explorer.testnet.arc.io/tx/0x6519e28c566a885de9145f6007cc7ac15f518d24bca67307dbc8ce0fb16841ab

## Scenario E
- createEpisode: https://explorer.testnet.arc.io/tx/0x2c73383c2e50c80b9d2d3cc40571f5127982fc7aec518ec52304b0fdee89246b
- seed 0.69 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0x309e3f9fe2766c809de59b06f6b61110bc8613480b2b23413dedca414f0624cd
- seed 0.67 USDC to payer wallet: https://explorer.testnet.arc.io/tx/0xcf5a96400de94a5ff9b0ec93ddf66179d0da0d89054106d87a0e7743d2f0380e
- coverer fund: https://explorer.testnet.arc.io/tx/0x2136c4af9f9e162dc3c32ac928bad75df32ba3425a534e455cb486249fe92a0c
- family fund: https://explorer.testnet.arc.io/tx/0x558300cc1e4d69443d8ee1fb802ff0d0f3ad9b2b7d7a6799fb49b622c264f55d
- first consultation paid: https://explorer.testnet.arc.io/tx/0xc2678a6772204615f7380bcdf7eb1d78a54f72567e49d1f9de8bd965d36d7f3f
