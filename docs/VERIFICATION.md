# Verification record

## Current release: wallet-funded executor

Verified on October 6, 2026:

- 21 Rust host tests passed: 12 retained account/recovery tests and 9 new shared-executor tests.
- Locked formatting checks and optimized `wasm32v1-none` builds passed for all three contracts.
- 9 Node tests passed, including exact policy wire types and changed/expired signer-payload rejection.
- Frontend and independent example production builds and lint passed. All 11 Edge browser tests passed, covering both forms, automatic quote races, wallet persistence, pending-action recovery, responsive layouts and the independent client. Browser quote/wallet controls do not mock contract execution or ledger outcomes. Desktop, mobile liquidity and separate-app screenshots were inspected.
- Shared guard bytecode, immutable configuration, actual Soroswap router/factory/pair hashes and underlying SAC identities were verified through public RPC.
- Disposable test identities were generated in process memory. No user secret was read or saved. Reports contain public policies, balances, hashes and diagnostics.

Release artifacts remain ignored by Git:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `caveat_executor.wasm` | 29,229 | `6586b06fee1a0709dbc7638ea180bf89fc8973aaeaa0b1c7b2811126cb549c5d` |
| `caveat_account.wasm` | 20,756 | `39671aeb423ecd71bfd6cda8f3b989a736390d90cd634a91d5b0c8e548cfe4f9` |
| `caveat_demo_router.wasm` | 10,162 | `947682a6342f92dcb2d4eb2e2110d6cf317710e191cd203eed67e6571f6e1fe7` |

The executor exports constructor, config, per-owner nonce, swap and add-liquidity endpoints. Legacy binaries retain their original checksums. Three existing event-publication deprecation warnings remain; builds and tests pass.

## Real Soroswap ledger evidence

Shared executor: `CCQMSZDYKY7TO6O65FEH663CISHHNWWUFY7N56GD2CWYGKETELXX554O`.

| Operation | Actual ledger result |
| --- | --- |
| [WASM upload](https://stellar.expert/explorer/testnet/tx/c26115da244a24250f4f7dbde904e724101d4049d09a2c699ab2772d8f382ea0) | Confirmed, ledger 5,054,801 |
| [Immutable shared deployment](https://stellar.expert/explorer/testnet/tx/78a83fc9d5613d5838c2a4e58df47f3d1a889376c9a5be5f4f39b10379efcc0c) | Confirmed, ledger 5,054,803 |
| [Exact USDC trustline](https://stellar.expert/explorer/testnet/tx/28c122ed8ae4feccd9eb2feb6325a39654dc59dcd19debfd257efbd930fd61dd) | Confirmed, ledger 5,054,829 |
| [Wallet-funded swap](https://stellar.expert/explorer/testnet/tx/766cd2f8f6cfcde8e43d1b62c7db740d443cfd4a3090cb18827616541703fa4a) | Confirmed, ledger 5,054,833; spent 2 XLM, wallet received 0.2114439 test USDC |
| [Wallet-funded liquidity](https://stellar.expert/explorer/testnet/tx/a7bc0267c2b394544db81e416fb6627290dd2f1631c8086a22f5768bc0df29a6) | Confirmed, ledger 5,054,836; spent 1 XLM + 0.10604 test USDC, wallet received 0.3088669 pool shares |

The guard's XLM, USDC and share balances were all zero after each action. The disposable wallet nonce advanced from 0 to 1 to 2. A 100,000-USDC minimum for a 1-XLM swap was subsequently rejected by genuine RPC with contract error #8; it was not submitted and nonce remained 2. [Public real-integration report](evidence/testnet-executor.json).

Testnet congestion initially left a minimum-inclusion-fee upload unconfirmed. The SDK now derives a fee from recent Soroban inclusion statistics and shows the assembled maximum before signing. An unconfirmed submission is not successful execution.

## New executor: adversarial ledger evidence

The isolated experiment deploys the same executor hash with separate fixture-specific immutable configurations. It uses actual native XLM and documented test USDC SACs, an enabled G-address wallet and issuer-independent balances. Venue output is seeded using USDC acquired from the real Soroswap pool. Fixture rates are artificial and are never presented as real DeFi.

| Case | Evidence |
| --- | --- |
| Honest venue | [Confirmed transaction](https://stellar.expert/explorer/testnet/tx/8c2c8878d22960a94d03dde9a7e0b4d5c78cd5591b9e18fd94938e9f35285572), ledger 5,054,873; wallet spends 1 XLM and receives 2 test USDC; guard balances zero, nonce 1 |
| Lying underpayment | [Submitted ledger failure](https://stellar.expert/explorer/testnet/tx/9817f4f2fedde27fbafb462d3868778e62ee4c1cc1b26e5e83f9d9f368765599), ledger 5,054,878; venue delivers 0.5 but claims 2 against a signed minimum of 1.9 |
| Forbidden approval | Actual public RPC `Auth/InvalidAction`; no attack transaction submitted; allowance zero |
| Extra input transfer | Actual public RPC `Auth/InvalidAction`; no attack transaction submitted; all balances unchanged |

The submitted underpayment failure identifies the correct guard and contract error #8 in ledger diagnostics. Before/after observations confirm wallet USDC, both guard balances, both venue balances, nonce and allowance were unchanged. Wallet XLM decreased **only by the actual charged transaction fee**. This proves the new wallet funding transfer rolled back with venue execution, rather than testing only prefunded contract custody.

To submit the deliberate failure, the harness takes resource estimates from a successful weak-minimum simulation that is never submitted, replaces the root policy with the strict minimum and retains its exact source-authorized funding child, then signs the strict transaction. An unrelated failure cannot satisfy the diagnostic assertion. [Public new-guard attack report](evidence/testnet-guard-attacks.json) has four passing cases.

## Host test boundary

Executor tests use genuine SAC underlying tokens and a stateful native venue/share contract. Setup-wide authorization mocking is cleared before execution. Each action receives only the exact wallet root and funding-child authorization; executor transfer restrictions run through the real Soroban host authorization system.

Tests check both wallet-funded actions, actual output/LP share receipts, ratio-constrained funding, a binding second-token cap, reversed reserve ordering, donation preservation, nonce/replay, expiry/route/token/bounds validation, missing signature/funding authorization, and every field of both policies. False receipts, approvals and excess transfers roll back all observed balances, shares and nonces. Fresh host `Auth/InvalidAction` diagnostics distinguish authorization rejection from unrelated errors. Malicious liquidity receipts have host evidence; no malicious liquidity fixture transaction was submitted on Testnet.

## Historical account evidence and recovery

The earlier immutable account `CDLHUYQNQ3N22WXFG72A6RP5JQIFTHZTR2RXFM3XGVZYWBQSZGLNUMQK` retains owner recovery and its original release pin. Its first [real Soroswap swap](https://stellar.expert/explorer/testnet/tx/8deb5fdd246a92d7cb2ad0535228db76c0110909686181c6d757ce62dc471111) succeeded in ledger 5,053,888: 1 XLM spent, 0.105722 USDC received at the account address. Later observed balances were 4 XLM / 0.105722 USDC, nonce 1. This was the prefunded account prototype, distinct from the current wallet-funded executor.

The historical account attack experiment's [honest success](https://stellar.expert/explorer/testnet/tx/858d794cde20f712dce7b7b2fc86128031f06be94948b91617ddced558e2d074) and [underpayment failure](https://stellar.expert/explorer/testnet/tx/bf4c2c8f317ffe170776347dd6875b0b81c2a1b231c080854f266e1ab54814e9) are retained in [its report](evidence/testnet-attacks.json). Do not label that older account evidence as new wallet-funded execution.

## Remaining limits

No independent audit, mainnet release, third-party adoption, universal Freighter interception, liquidity removal or later-position loss protection is claimed. Approval and extra-transfer attacks have genuine public preflight rejection and host tests, rather than submitted ledger failures. The standalone app has browser/layout and build verification; automated live signing uses the same SDK with disposable wallets, not browser-driven Freighter signatures.

CI configuration uses the passing local verification script, but no remote workflow run was triggered in this session. State restoration and Testnet resets can require maintenance; missing/changed state remains an error. Follow [TESTNET.md](TESTNET.md) to repeat the checks.
