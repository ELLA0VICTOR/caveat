# Caveat

**Your intent. Your rules.** A testnet-first Stellar/Soroban security prototype for the Find Your Way General Track.

An owner signs maximum spending, minimum receipts for exact token addresses, expiry, a nonce, a specific router/pair, and zero approvals. A contract-controlled account calls Soroswap, checks actual token balance changes, and aborts violating operations atomically. This is a constrained contract account, not a general SEP smart wallet.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL. The app starts in **Local demo**, with explicitly illustrative honest, underpayment, and forbidden-approval scenarios. It records no fake transactions or protected funds. Navigation, editable conditions, scenario selection, activity, deployment settings, and the security-model dialog work on desktop and mobile.

**Testnet** uses the actual Stellar SDK, Freighter, and Stellar RPC: read owner/nonce and token precision/balances, simulate `execute`, review exact conditions and XDR, sign, submit, and confirm from the ledger. Configure a deployed Caveat account and verified router/token IDs first. A missing wallet, contract, pool, balance, or failing simulation stays an error; it never falls back to a model.

## Project

- `src/App.tsx` — responsive product workspace.
- `src/lib/policy.ts` — exact decimal conversion and explanatory policy model.
- `src/lib/stellar.ts` — genuine wallet/RPC integration; fixed testnet network.
- `contracts/account` — guarded, immutable-allowlist, owner-authorized account.
- `contracts/demo-router` — isolated test fixture for honest swaps, lying receipts, approval requests, and excess transfers.
- `tests` — precision/policy and Edge browser tests.
- `.github/workflows/verify.yml` — Linux frontend, Soroban host-test, and WASM build workflow.

Read [architecture and threat model](docs/ARCHITECTURE.md), [testnet deployment and demo instructions](docs/TESTNET.md), and [verification evidence and remaining limitations](docs/VERIFICATION.md).

## Verify

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:ui
cargo test --locked --manifest-path contracts/Cargo.toml
cargo build --locked --manifest-path contracts/Cargo.toml --target wasm32v1-none --release
```

Browser tests use an installed Microsoft Edge. Rust tests assert all relevant balances and nonce survive a failed underpayment and reject forbidden authorizations. Contract testing/building was blocked locally by Windows Application Control; the Linux workflow is provided and must pass before deployment. The application and browser tests passed locally. No contract is claimed deployed or audited, and no on-chain swap is claimed executed.

## Security boundary

Protects assets held by the Caveat contract, using honest, immutable-allowlisted SEP-41 tokens. It never grants allowances. The owner authorizes the entire policy through Soroban source-account authorization; the account authorizes only an exact nested transfer. Router return values do not decide success. Failed contract invocations revert token changes but can incur network fees. Owner-only withdrawal is an explicit recovery path.

It does not protect ordinary wallet balances, dishonest token balance reports, issuer freezes/clawbacks, compromised signing keys, or weak conditions the owner signs. Exact token addresses matter. Test routers are for disposable isolated accounts. This is an unaudited hackathon prototype.
