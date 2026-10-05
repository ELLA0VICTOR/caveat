# Build and demonstrate on Stellar testnet

## Current evidence

The browser's Local demo is an explanatory TypeScript model. It uses illustrative XLM/USDC amounts and makes no RPC calls. It is not a substitute for the Rust contract tests or a ledger transaction. `caveat-demo-router` is an intentionally adversarial fixture, not a DEX. The supported real DeFi integration calls Soroswap's router ABI directly.

The frontend's Testnet mode performs genuine RPC simulation, Freighter signing, submission, and confirmation against `https://soroban-testnet.stellar.org`. It stays unavailable until you configure actual deployed contracts. No private key is embedded in this project. No deployment ID or transaction hash has been fabricated.

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

## Deploy the actual Soroswap account

1. Fund a testnet source identity with Friendbot. Use the same public key as your Freighter testnet owner (or import a dedicated testnet identity into Freighter). Keep secret keys outside the repository.
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

6. Open deployment settings in Caveat, enter the four exact contract IDs, and save. Connect Freighter on Testnet. Choose a minimum receipt consistent with the real pool's quote; demo amounts are illustrative and must not be assumed to represent live market prices.
7. Prepare the intent, inspect its exact addresses, amounts, expiry, pair, nonce, and unsigned XDR, then sign in Freighter. Only RPC `SUCCESS` becomes a confirmed execution. Inspect the returned transaction link and measured return value.
8. Verify balances and nonce from RPC/CLI after success. Failed intents retain contract balances and nonce, but may consume transaction fees. A pending result needs explorer/RPC inspection before retrying.

## Honest and malicious on-chain demonstrations

Run the Rust tests first. They use the Soroban host, two genuine Stellar Asset Contracts, the guarded account, and the fixture router. The underpayment fixture transfers input, pays too little output, and lies in its return vector; the guard aborts and the tests compare both sides' balances and nonce. Approval and extra-transfer requests fail authorization.

For a ledger demo, deploy *separate, empty, disposable* Caveat accounts with only the fixture router in their allowlist. Never add fixtures to the real Soroswap account. Each fixture needs output-token funding. Deploy mode `0` for honest, `1` for lying underpayment, `2` for forbidden approval, or `3` for an extra transfer. Use a token pair you control and can fund; the router does not create a liquidity pool or mint tokens.

```powershell
stellar contract deploy --wasm contracts/target/wasm32v1-none/release/caveat_demo_router.wasm --source owner --network testnet -- --mode 1
```

Set the fixture ID as router and pair in a complete policy, fund the isolated account's input and fixture's output, and invoke `execute` through CLI or the Testnet UI. At simulation, violating operations will usually be rejected before submission. Label that evidence **RPC simulation rejected**; it is not a failed ledger transaction. A manually submitted failing invocation can demonstrate the ledger rollback, with fees paid. Record balances, nonce, simulation error, and actual ledger hash where available. The tests are the deterministic rollback evidence, not the browser animation.

## Hackathon pitch

“A wallet signature approves a call. Caveat adds the outcome you meant: spend at most this exact token amount, receive at least that exact token amount, before this time, without granting token allowances.”

Show the honest model, then an underpay attack and an approval attack, each explicitly labeled Local demo. Follow with the real Soroswap testnet transaction and its explorer evidence once deployed. Explain that balances are checked after nested execution and a violation aborts atomically. State the trust assumptions from [ARCHITECTURE.md](ARCHITECTURE.md), and distinguish host tests, RPC simulation, and ledger execution. This is an unaudited hackathon prototype.
