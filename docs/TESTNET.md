# Build and demonstrate on Stellar testnet

## Current evidence

The browser runs exclusively on Stellar Testnet using the real Soroswap route. It has no offline preview or illustrative swap results. `caveat-demo-router` remains an intentionally adversarial contract fixture for host tests and isolated on-chain experiments; it is not a DEX. The supported real DeFi integration calls Soroswap's router ABI directly.

The frontend's Testnet mode performs genuine RPC simulation, Freighter signing, submission, and confirmation against `https://soroban-testnet.stellar.org`. Wallet deployment is now available in deployment settings. No private key is embedded in this project. No deployment ID or transaction hash has been fabricated.

On October 5, 2026, read-only RPC checks confirmed the published router and factory executable hashes, the native XLM / documented test USDC pool, and positive reserves. At ledger 5,040,253, an unsigned upload simulation of the tested Caveat WASM succeeded, returned its expected hash, and estimated a maximum fee of 101,722,295 stroops (10.1722295 test XLM). This is simulation evidence, not a signed upload, deployed account, or successful swap. Recheck live state before every deployment; testnet state and prices can change.

## Deploy with Freighter

1. Keep Freighter on **Testnet** with a Friendbot-funded wallet. Run `npm.cmd run dev` and open the Vite URL in the browser where Freighter is installed.
2. Open **Deployment settings**, connect the wallet, and select **Prepare account creation**. The supported route is native XLM → test USDC. The app checks the live router/factory/pair bytecode against [Soroswap's published manifest](https://github.com/soroswap/core/blob/main/public/testnet.contracts.json).
3. If the release bytecode is not uploaded, review its SHA-256, unsigned transaction XDR, and fee limit; sign **Publish the tested contract** in Freighter. Wait for RPC confirmation. Select account creation again to prepare deployment.
4. Review the owner, predicted account address, two exact token addresses, single router, fee, and XDR. Sign the atomic account deployment. A predicted address becomes the saved deployment only after successful ledger confirmation and an owner/bytecode/allowlist check.
5. Review and sign the suggested **5 test XLM** deposit. The account is checked before funding. Refresh balances after confirmation.
6. Close settings. The swap starts at **1 XLM** with an empty minimum. Select **Load live quote & set minimum** to populate a minimum 1% below the current pool quote; review or edit it. This is a user-selected tolerance, not a price guarantee.
7. Prepare, review the complete signed policy, and sign the guarded swap in Freighter. Only ledger `SUCCESS` is confirmed execution. Inspect its explorer link and actual spent/received result.
8. Use **Owner recovery** in settings to withdraw either token to the same wallet. To receive test USDC in a G-account, add its exact issuer trustline in Freighter first. The UI never creates approvals. Pending setup transactions survive reload in browser storage; check confirmation before retrying.

The test USDC identity comes from [Stellar's asset documentation](https://developers.stellar.org/docs/build/guides/basics/verify-trustlines): issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. It is test currency, subject to issuer powers. No additional USDC faucet is needed for the first XLM → USDC swap; the live pool supplies the output.

Exact supported contracts:

| Contract | Testnet address |
| --- | --- |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Test USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Soroswap router | `CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD` |
| Soroswap factory | `CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY` |
| XLM / test USDC pair | `CCBX3NZTCQLQFSPG7HBOKL4P2RVPOPVFHDNRTOSCCJWBTPL2GHEH7RQS` |

## Tooling

Use Node 24+, Rust, the `wasm32v1-none` target, and Stellar CLI. Install the CLI using [Stellar's current setup instructions](https://developers.stellar.org/docs/tools/cli/install-cli). On Windows, contract host tests also need a native linker. Use a supported Rust GNU toolchain with MinGW, or MSVC with Build Tools.

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd test
npm.cmd run test:ui
rustup target add wasm32v1-none
cargo test --locked --manifest-path contracts/Cargo.toml
cargo build --locked --manifest-path contracts/Cargo.toml --target wasm32v1-none --release
```

If using the project-local toolchain installed by Codex, set these in your terminal first:

```powershell
$env:CARGO_HOME = Join-Path (Get-Location) '.tools/cargo'
$env:RUSTUP_HOME = Join-Path (Get-Location) '.tools/rustup'
$env:PATH = "$env:CARGO_HOME\bin;$env:PATH"
```

Windows Application Control blocked native Cargo build scripts on this machine. Contract verification now runs successfully in Ubuntu 24.04 WSL. To reuse the Linux toolchain installed for this project:

```powershell
wsl.exe -d Ubuntu-24.04 -u root
```

Then, inside Ubuntu:

```sh
export CARGO_HOME=/var/tmp/caveat-linux-verify/cargo
export RUSTUP_HOME=/var/tmp/caveat-linux-verify/rustup
export PATH="$CARGO_HOME/bin:$PATH"
cd /mnt/c/Users/kolev/Desktop/caveat
bash scripts/verify-contracts.sh
```

The same script runs in GitHub Actions. It checks formatting, runs the host tests, builds both release WASM files, and records SHA-256 checksums. Keep the committed lockfile; it fixes an incompatible transitive Ed25519 Dalek 3 resolution. A fresh Linux environment needs its own Rust toolchain and WASM target before running this script.

## Alternative: deploy through Stellar CLI

1. Fund a dedicated CLI testnet identity with Friendbot. Keep its secret outside the repository. Prefer the browser flow above for an existing Freighter wallet; it does not require exporting keys.
2. Verify the current [official Soroswap testnet manifest](https://github.com/soroswap/core/blob/main/public/testnet.contracts.json). The published router ID prefilled in the app can become stale after resets. Check the executable/WASM and token addresses yourself; matching method names alone does not prove deployment provenance.
3. Choose two trusted SEP-41 token contract addresses with an active funded Soroswap pool. Use the exact addresses, not token symbols. Do not mix mainnet/testnet addresses. Token decimals are fetched through RPC.
4. Deploy Caveat with the owner and immutable allowlists supplied to its constructor. Deployment plus construction is atomic. Use only the actual Soroswap router for this account.

Replace the placeholders below with verified values. `<INPUT>` and `<OUTPUT>` are contract addresses, `<OWNER>` is a G-address, and `owner` is your local Stellar CLI identity.

```powershell
stellar contract deploy --wasm contracts/target/wasm32v1-none/release/caveat_account.wasm --source owner --network testnet -- --owner '<OWNER>' --tokens '["<INPUT>","<OUTPUT>"]' --routers '["<SOROSWAP_ROUTER>"]'
```

5. Save the returned Caveat contract ID. Deposit a small amount of the input token into the contract account. Token quantities for CLI are integers in the token's smallest unit. For 7 decimals, 100 tokens = 1000000000. Classic asset contracts may require trustlines for the CLI source; contract recipients do not use classic trustlines.

```powershell
stellar contract invoke --id '<INPUT>' --source owner --network testnet -- transfer --from '<OWNER>' --to '<CAVEAT_ACCOUNT>' --amount 1000000000
```

6. Open deployment settings in Caveat, enter the four exact contract IDs, and save. Connect Freighter on Testnet. Load a live quote or choose a minimum receipt consistent with the real pool; no output price is predetermined.
7. Prepare the intent, inspect its exact addresses, amounts, expiry, pair, nonce, and unsigned XDR, then sign in Freighter. Only RPC `SUCCESS` becomes a confirmed execution. Inspect the returned transaction link and measured return value.
8. Verify balances and nonce from RPC/CLI after success. Failed intents retain contract balances and nonce, but may consume transaction fees. A pending result needs explorer/RPC inspection before retrying.

## Honest and malicious on-chain demonstrations

Run the Rust tests first. They use the Soroban host, two genuine Stellar Asset Contracts, the guarded account, and the fixture router. The underpayment fixture transfers input, pays too little output, and lies in its return vector; the guard aborts and the tests compare both sides' balances and nonce. Approval and extra-transfer requests fail authorization.

For a ledger demo, deploy *separate, empty, disposable* Caveat accounts with only the fixture router in their allowlist. Never add fixtures to the real Soroswap account. Each fixture needs output-token funding. Deploy mode `0` for honest, `1` for lying underpayment, `2` for forbidden approval, or `3` for an extra transfer. Use a token pair you control and can fund; the router does not create a liquidity pool or mint tokens.

```powershell
stellar contract deploy --wasm contracts/target/wasm32v1-none/release/caveat_demo_router.wasm --source owner --network testnet -- --mode 1
```

Set the fixture ID as router and pair in a complete policy, fund the isolated account's input and fixture's output, and invoke `execute` through CLI. The browser swap path deliberately accepts only the verified Soroswap route, never an adversarial fixture. At simulation, violating operations will usually be rejected before submission. Label that evidence **RPC simulation rejected**; it is not a failed ledger transaction. A manually submitted failing invocation can demonstrate the ledger rollback, with fees paid. Record balances, nonce, simulation error, and actual ledger hash where available. Host tests supply deterministic rollback evidence; ledger claims require actual submitted transactions.

## Hackathon pitch

“A wallet signature approves a call. Caveat adds the outcome you meant: spend at most this exact token amount, receive at least that exact token amount, before this time, without granting token allowances.”

Perform the real Soroswap testnet swap live: connect the funded account, set conditions, load the pool quote, review and sign, then inspect the ledger receipt and balances. To demonstrate a rejected outcome on this route, deliberately set a minimum above the live output and show the real RPC simulation rejection; label it as a check before submission. Underpayment and approval attacks use separate disposable fixture deployments through CLI, or the existing Soroban host tests with their explicit test evidence. Explain that balances are checked after nested execution and a violation aborts atomically. State the trust assumptions from [ARCHITECTURE.md](ARCHITECTURE.md), and distinguish host tests, RPC simulation, and ledger execution. This is an unaudited hackathon prototype.
