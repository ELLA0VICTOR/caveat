# Caveat

**Your intent. Your rules.** A testnet-first Stellar/Soroban security prototype for the Find Your Way General Track.

An owner signs maximum spending, minimum receipts for exact token addresses, expiry, a nonce, a specific router/pair, and zero approvals. A contract-controlled account calls Soroswap, checks actual token balance changes, and aborts violating operations atomically. This is a constrained contract account, not a general SEP smart wallet.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL. The app starts in **Local demo**, with explicitly illustrative honest, underpayment, and forbidden-approval scenarios. It records no fake transactions or protected funds. Navigation, editable conditions, scenario selection, activity, deployment settings, and the security-model dialog work on desktop and mobile.

**Testnet** uses the actual Stellar SDK, Freighter, and Stellar RPC. Open deployment settings, connect your funded testnet wallet, and prepare account creation. Review and sign the checksum-verified WASM upload if needed, then the atomic deployment with your wallet as owner. After confirmation, review a small XLM deposit. Close settings, load the live Soroswap quote, and prepare your guarded swap. Each write shows its unsigned XDR and maximum fee before Freighter signing. Pending setup transactions are retained in this browser for confirmation checks.

The wallet setup and swap path support native test XLM → Stellar's documented test USDC on Soroswap. Before funding or swapping, the app checks the Caveat bytecode, owner, immutable allowlists, Soroswap router/factory/pair hashes, asset identities, and active liquidity. Saving an existing address configuration alone proves nothing. A missing wallet, contract, pool, balance, changed executable, or failing simulation stays an error; it never falls back to a model.

## Project

- `src/App.tsx` — responsive transaction-first product interface.
- `src/lib/policy.ts` — exact decimal conversion and explanatory policy model.
- `src/lib/stellar.ts` — genuine wallet/RPC integration; fixed testnet network.
- `src/lib/testnet.ts` — release-pinned wallet deployment, funding, recovery, quote lookup, and provenance checks.
- `contracts/account` — guarded, immutable-allowlist, owner-authorized account.
- `contracts/demo-router` — isolated test fixture for honest swaps, lying receipts, approval requests, and excess transfers.
- `tests` — precision/policy and Edge browser tests.
- `scripts/verify-contracts.sh` — Linux contract formatting, host tests, release WASM builds, and checksums.
- `.github/workflows/verify.yml` — frontend checks and the same Linux contract verification script.

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

Browser tests use an installed Microsoft Edge. Twelve Rust tests passed in Ubuntu 24.04 WSL with Rust 1.99.0 and the locked Soroban SDK 23.5.3. They assert all relevant balances and nonce survive a failed underpayment, verify fresh authorization-failure diagnostics for forbidden calls, bind every signed policy field, and exercise owner-only recovery. See the verification record for release artifacts and outstanding ledger checks. No contract is claimed deployed or audited, and no on-chain swap is claimed executed.

On Linux with Rust and the `wasm32v1-none` target installed, repeat contract verification with:

```sh
bash scripts/verify-contracts.sh
```

The script uses a persistent native Linux build cache, limits compilation to two jobs, and copies release WASM files plus `SHA256SUMS` into `contracts/target/wasm32v1-none/release/`. `npm run dev` and `npm run build` stage the Caveat WASM into `public/contracts/` after checking its release hash and size. Without built WASM, the frontend still runs but cannot upload the contract. CI downloads the tested contract artifact before building the frontend. Build outputs and generated test snapshots stay ignored by Git. Keep `contracts/Cargo.lock`: Soroban host 23.0.1 permits Ed25519 Dalek versions above 2, but version 3's RNG API is incompatible with its test utilities. The tested lockfile resolves version 2.2.0.

## Security boundary

Protects assets held by the Caveat contract, using honest, immutable-allowlisted SEP-41 tokens. It never grants allowances. The owner authorizes the entire policy through Soroban source-account authorization; the account authorizes only an exact nested transfer. Router return values do not decide success. Failed contract invocations revert token changes but can incur network fees. Owner-only withdrawal is an explicit recovery path.

It does not protect ordinary wallet balances, dishonest token balance reports, issuer freezes/clawbacks, compromised signing keys, or weak conditions the owner signs. Exact token addresses matter. Test routers are for disposable isolated accounts. This is an unaudited hackathon prototype.
