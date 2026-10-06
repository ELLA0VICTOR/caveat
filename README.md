# Caveat

**Your signature. Your terms.** A wallet-funded Stellar/Soroban guard for the Find Your Way General Track.

Caveat now supports two real Soroswap actions on **Stellar Testnet**: swap XLM for test USDC, and provide XLM / test USDC liquidity. You sign spending limits, a minimum actual receipt, exact contract identities, expiry, a nonce and zero approvals. The guard takes only the funds needed for the action, checks the actual result, and returns tokens or pool shares to the signing wallet in the same invocation. **No separate Caveat account or deposit is required.**

The reusable SDK and a separate pool-deposit app show how another interface can integrate the same guard. Apps must explicitly integrate it; Caveat does not intercept ordinary Freighter transactions elsewhere. This is an unaudited testnet prototype, not a universal wallet firewall.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL in the browser with Freighter installed. Keep Freighter on **Testnet** and fund its wallet using [Friendbot](https://friendbot.stellar.org/).

1. Connect the wallet. Open the gear icon for **Wallet setup**.
2. Enable test USDC if needed. This one-time Stellar trustline allows your wallet to receive the exact asset; it is not a Caveat deposit or spending allowance.
3. Choose **Swap**, enter a small XLM amount, and review the automatic quote and minimum.
4. Select **Prepare & review intent**, inspect the exact conditions and fee, then sign in Freighter.
5. After ledger confirmation, USDC is in your wallet. Choose **Provide liquidity** to contribute both tokens, with separate spending caps and a minimum pool-share receipt.

Quotes update after a 400 ms typing pause. Automatic minimums use 1% tolerance; you can edit them. Late quotes cannot replace newer conditions, and failed quotes block preparation. Review uses captured transaction terms. Freighter connections restore after refresh without prompting. Pending actions survive reload and require confirmation checks before another action.

**Earlier deposit:** Wallet setup → **Recover funds from an earlier account** keeps the original account address and owner-only withdrawal flow. Enable the USDC trustline first if withdrawing that token. New actions do not spend from the earlier contract account.

## Separate integration app

The homepage links to **Open the separate integration example** at `/integrations/pool/index.html`. It is a separately built TypeScript app importing `@caveat/sdk` and Freighter, with no Caveat React components or internal hooks. It uses the same real testnet executor for protected liquidity deposits. It is our integration example, not a claim that Soroswap or other companies have adopted Caveat.

To work on it independently:

```powershell
npm.cmd run example:dev
```

Its development server uses port 5175. The normal Caveat build also includes this standalone app.

## Evidence

The shared executor is `CCQMSZDYKY7TO6O65FEH663CISHHNWWUFY7N56GD2CWYGKETELXX554O`.

- [Real wallet-funded swap](https://stellar.expert/explorer/testnet/tx/766cd2f8f6cfcde8e43d1b62c7db740d443cfd4a3090cb18827616541703fa4a): 2 XLM → 0.2114439 test USDC returned to the wallet.
- [Real liquidity deposit](https://stellar.expert/explorer/testnet/tx/a7bc0267c2b394544db81e416fb6627290dd2f1631c8086a22f5768bc0df29a6): 1 XLM + 0.10604 test USDC → 0.3088669 pool shares returned to the wallet.
- [Submitted lying-venue failure](https://stellar.expert/explorer/testnet/tx/9817f4f2fedde27fbafb462d3868778e62ee4c1cc1b26e5e83f9d9f368765599): new executor rejects underpayment and rolls back wallet funding, venue transfers and nonce. Only the network fee remains charged. This uses an isolated adversarial fixture, not Soroswap.

Public reports: [real integration](docs/evidence/testnet-executor.json), [new guard attacks](docs/evidence/testnet-guard-attacks.json), and [historical account attacks](docs/evidence/testnet-attacks.json). Test identities exist only in process memory. No user key was read or saved.

## Verify

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:ui
```

The contract script runs formatting checks, locked host tests and release WASM builds on Linux:

```sh
bash scripts/verify-contracts.sh
```

On this machine, use the installed Ubuntu WSL toolchain described in [TESTNET.md](docs/TESTNET.md). The verified workspace has 21 Rust host tests and 9 Node tests; browser coverage includes both action forms, wallet restoration, quote races, pending submissions, viewport fit and the separate integration app. CI uses the same contract script. Keep `contracts/Cargo.lock`, which pins the compatible Ed25519 Dalek dependency.

Repeat live testnet experiments, using fresh disposable wallets:

```powershell
npm.cmd run test:executor:testnet
npm.cmd run test:guard-attacks:testnet
```

The first command deploys a new shared guard, verifies real swaps and liquidity, and updates the SDK deployment pin only after success. Rebuild/restart afterward. The second tests isolated instances of the same executor bytecode against honest and malicious fixtures; it does not modify the published Soroswap guard.

## Code and limits

- `contracts/executor`: shared guard; immutable route, wallet funding, actual receipt checks, direct settlement.
- `packages/caveat-sdk`: standalone integration client; see its [usage guide](packages/caveat-sdk/README.md).
- `examples/pool-deposit`: separate live liquidity interface.
- `src`: the Caveat interface; approved layout and palette retained.
- `contracts/account` and `src/lib/testnet.ts`: earlier account implementation and recovery.
- `contracts/demo-router`: clearly labeled adversarial swap fixture.

Checks require honest pinned token and share-balance reports, Soroban atomicity and uncompromised wallet authorization. Weak terms, market fairness, later liquidity losses, issuer powers, transactions that bypass the guard and network fees are outside the checks. There are no administrator, upgrade, allowance or arbitrary-call endpoints in the executor. Direct token donations to it are unsupported and cannot be recovered.

Read the [architecture and threat model](docs/ARCHITECTURE.md), [live demo guide](docs/DEMO.md), and [verification record](docs/VERIFICATION.md).
