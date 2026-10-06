# @caveat/sdk

A standalone TypeScript client for Caveat's wallet-funded, immutable Soroswap Testnet executor. No React, Freighter, app hooks, server or secret-key dependency. Apps opt in by routing supported actions through this guard.

The current endpoints are XLM → test USDC swaps and XLM / test USDC liquidity contributions. The executor supports both token directions, but the SDK's swap convenience method currently quotes and prepares XLM → USDC only. Liquidity requires an existing funded pool. Pool shares return to the signing wallet; liquidity removal is not implemented.

```ts
import { CaveatClient } from '@caveat/sdk'

const guard = new CaveatClient()
const quote = await guard.quote('liquidity', '1')
const prepared = await guard.prepare(walletPublicAddress, 'liquidity', {
  amount: '1',
  maxB: quote.maxB,
  minimum: quote.minimum,
  minutes: 10,
})

// Show prepared.terms, source/recipient, executor, nonce, expiresAt,
// exact route identities, maximum fee and XDR for human review.
const signedXdr = await yourWalletSigner(prepared.xdr)
const receipt = await guard.submitSigned(prepared, signedXdr, hash => {
  // Persist the hash before waiting; check status before retrying an action.
})

if (receipt.status === 'confirmed') {
  console.log(receipt.outcome) // measured ledger return, not the quote
}
```

For swaps, use `quote('swap', amount)` and `prepare(owner, 'swap', { amount, minimum, minutes })`. Quote amounts are decimal strings. Policy arithmetic uses exact i128 token units, with seven decimals for these pinned assets and pool shares. Quote estimates use 1% automatic tolerance; callers can choose a stricter minimum. Never silently weaken a user's bounds to make a transaction pass.

`wallet(owner)` reads the actual wallet balances, shares, nonce and USDC trustline status. If necessary, `prepareTrustline(owner)` returns a separate classic transaction enabling the exact test USDC issuer. Sign and confirm that once before preparing the protected action. It grants asset receipt permission, not a spending allowance.

`prepare` verifies the executor bytecode and immutable configuration, Soroswap router/factory/pair provenance, underlying SAC identities, and real source-account authorization. It simulates the actual transaction and returns a captured review snapshot. Missing state, provenance changes, restoration requirements and simulation failures remain errors. `simulation` is explicitly a preflight outcome, never proof of completed execution.

`submitSigned` rejects changed or expired transaction bodies and sends only the reviewed XDR. Unknown results remain pending; poll `status(hash)` before retrying. Only confirmed ledger status establishes success. The maximum assembled fee includes inclusion and resource fees; actual fees are outside contract spending limits. Apps must independently check that their wallet signer uses Stellar Testnet.

`prepareOperation` is a low-level helper for test infrastructure, not a protected-action endpoint. Its generic operations receive no Caveat protection unless they invoke the tested executor policy. A call to this helper alone must never be labeled protected.

The [separate pool-deposit example](../../examples/pool-deposit/src/main.ts) implements wallet access, live quotes, asset setup, review, signing, status and pending-submission recovery. The app imports only this package and Freighter; it contains no Caveat React code. To develop it independently, run `npm.cmd run example:dev` from the repository root.

The package is a local npm workspace and has not been published to npm. `npm.cmd run sdk:build` emits its ESM JavaScript and declarations into ignored `dist/`. The public deployment module contains actual verified Testnet identifiers and pins. Rebuild clients after a reset or verified deployment update. Custom constructor arguments are useful for isolated tests; production app code should retain the verified default pin/configuration.

This is an unaudited Testnet prototype. Only integrated actions are covered. Honest pinned token/share accounting, Soroban atomicity and uncompromised wallet authorization are assumptions. Market fairness, later pool losses, issuer powers, compromised keys, weak signed terms, external transactions and network fees remain outside the checks. Direct transfers to the guard are unsupported donations with no withdrawal API.
