# @caveat/sdk

A standalone TypeScript client for Caveat's wallet-funded, immutable Soroswap executor. Testnet and Mainnet use separate pinned network profiles. Apps opt in by routing supported actions through the guard and provide their own wallet integration.

The supported endpoints are XLM ↔ USDC swaps and XLM / USDC liquidity contributions, using each network's exact asset identities. The SDK quotes and prepares both swap directions through the selected executor. Liquidity requires an existing funded pool. Pool shares return to the signing wallet; liquidity removal is not implemented.

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

For USDC → XLM, use `quote('swap', amount, 'usdc-to-xlm')` and pass `direction: 'usdc-to-xlm'` in the prepared terms. The default direction is `'xlm-to-usdc'`. `swapAssets(direction)` exposes the exact pinned addresses and display symbols. Both quotes and the signed policy must use the same direction. Capture review terms from `prepared.terms`; preparation snapshots caller terms before async work.

`wallet(owner)` reads the actual wallet balances, shares, nonce and USDC trustline status. If necessary, `prepareTrustline(owner)` returns a separate classic transaction enabling the exact test USDC issuer. Sign and confirm that once before preparing the protected action. It grants asset receipt permission, not a spending allowance.

`prepare` verifies the executor bytecode and immutable configuration, Soroswap router/factory/pair provenance, underlying SAC identities, and real source-account authorization. It simulates the actual transaction and returns a captured review snapshot. Missing state, provenance changes, restoration requirements and simulation failures remain errors. `simulation` is explicitly a preflight outcome, never proof of completed execution.

`submitSigned` rejects changed or expired transaction bodies, mismatched wallet sources and preparations from a different network. Unknown results remain pending; poll `status(hash)` before retrying. Only confirmed ledger status establishes success. The maximum assembled fee includes inclusion and resource fees; actual fees are outside contract spending limits. Apps must independently check that their wallet signer uses `guard.profile.passphrase`.

`prepareOperation` is a low-level helper for test infrastructure, not a protected-action endpoint. Its generic operations receive no Caveat protection unless they invoke the tested executor policy. A call to this helper alone must never be labeled protected.

The [separate pool-deposit example](../../examples/pool-deposit/src/main.ts) implements wallet access, live quotes, asset setup, review, signing, status and pending-submission recovery. The app imports only this package and Freighter; it contains no Caveat React code. To develop it independently, run `npm.cmd run example:dev` from the repository root.

The package is a local npm workspace and has not been published to npm. `npm.cmd run sdk:build` emits its ESM JavaScript and declarations into ignored `dist/`. The public deployment module contains actual verified Testnet identifiers and pins. Rebuild clients after a reset or verified deployment update. Custom constructor arguments are useful for isolated tests; production app code should retain the verified default pin/configuration.

## Mainnet profile

```ts
const mainnet = new CaveatClient(verifiedMainnetExecutorAddress, undefined, 'mainnet')
await mainnet.verifyExecutor()
const quote = await mainnet.quote('swap', '0.1')
```

`new CaveatClient()` retains the verified Testnet default. The optional third constructor argument selects `'testnet'` or `'mainnet'`. `profile` exposes that network's passphrase, RPC, Horizon, explorer, route, code hashes and USDC issuer. `encodePolicy` accepts the selected profile as its sixth argument; client preparation supplies it automatically. Use `swapAssets(direction, mainnet.profile.route)` for production token identities.

The Mainnet profile has no default executor until a deployment is verified. Quotes remain available before deployment; protected preparation requires a confirmed executor address. `prepareDeployment(owner, verifiedWasm)` prepares either code publication or immutable instance creation, depending on live code availability. It returns an `ExecutorDeployment` with the operation kind, reviewable transaction and predicted address for creation. Verify the confirmed address and configuration before making an instance available to other callers. See [Mainnet deployment](../../docs/MAINNET.md) for the wallet workflow, current fee evidence and execution checks.

Independent security review is pending. Only integrated actions are covered. Honest pinned token/share accounting, Soroban atomicity and uncompromised wallet authorization are assumptions. Market fairness, later pool losses, issuer powers, compromised keys, weak signed terms, external transactions and network fees remain outside the checks. Direct transfers to the guard are unsupported donations with no withdrawal API.
