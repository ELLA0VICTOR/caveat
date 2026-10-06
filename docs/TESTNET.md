# Use Caveat on Stellar Testnet

## Wallet flow

1. Use [Freighter](https://www.freighter.app/) on **Testnet**. Fund its public G-address with [Friendbot](https://friendbot.stellar.org/). Never export a secret key into this project.
2. Run `npm.cmd install` and `npm.cmd run dev`. Open the Vite URL where Freighter is installed.
3. Connect the wallet. Open the gear icon. If test USDC is not enabled, select **Review test USDC setup** and sign its exact-issuer trustline in Freighter. Wait for confirmation.
4. Close setup. Choose **Swap**, starting with 1–2 XLM. The live quote and 1% automatic minimum load as you type. You can choose a stricter minimum.
5. Select **Prepare & review intent**. Review the wallet/recipient, guard, tokens, router/pool, spending cap, minimum, nonce, expiry, zero approvals, unsigned XDR and maximum fee. Sign in Freighter.
6. Wait for ledger confirmation. Output is in your wallet. No Caveat deposit is required.
7. Choose **Provide liquidity**. Enter an XLM cap; the current pool ratio fills the test USDC cap. Sign a minimum pool-share receipt as well. Ensure both wallet token balances cover the action.
8. Only a confirmed transaction means execution succeeded. Check pending submissions before retrying; fees apply to submitted failures.

The middle arrow in **Swap** reverses XLM / test USDC. It changes the exact token identities, quote and signing policy together. Enter a small USDC amount to swap back to XLM. The old minimum is cleared; review the new XLM minimum before signing. On the liquidity form, the downward arrow is only a flow separator.

A transaction status modal opens for wallet approval, submission, and ledger confirmation. Confirmed swaps show the measured token spend and receipt; liquidity shows both contributions and actual pool shares. USDC setup and earlier account recovery use the same status view. Submitted transactions retain an explorer link and continue confirmation checks after the modal closes. Pending swaps and USDC setup restore the modal after refresh.

For a small liquidity demonstration, swapping 2 XLM first usually supplies enough test USDC for a subsequent 1 XLM liquidity contribution. Live pool quotes decide the actual required amounts; do not assume a fixed exchange rate.

The exact test USDC issuer is `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. A trustline allows receipt of that asset; it does not authorize Caveat spending. XLM → USDC swaps supply the test output from the real pool, so a separate USDC faucet is not needed.

## Test contract checks

Choose **Swap**, then use the **Swap venue** selector to choose **Underpaying test contract**, **Forbidden approval test**, or **Extra transfer test**. Each selection starts with 1 XLM and a 1.9 test-USDC minimum. Click **Check test contract** to run fresh public RPC simulation against deployed contracts. The modal explains verified rejection and links the isolated venue and guard addresses. Rates are artificial; checks accept up to 1 XLM and submit no transaction. A weak custom minimum can permit the smaller underpayment receipt. Select **Soroswap** to return to real pool swaps.

## Earlier deposited funds

Open Wallet setup → **Recover funds from an earlier account**. The earlier deployment address saved in this browser is preserved. Verify its owner and balances, choose XLM or test USDC, enter the withdrawal amount, review and sign in Freighter. Enable the USDC trustline first for a USDC withdrawal.

If browser storage was cleared, enter your earlier account address in that section and save the recovery settings. The previously verified owner account was `CDLHUYQNQ3N22WXFG72A6RP5JQIFTHZTR2RXFM3XGVZYWBQSZGLNUMQK`. Its immutable code and recovery API remain unchanged. New actions use the shared guard and do not consume its balance.

## Public deployment

| Contract | Testnet address |
| --- | --- |
| Shared executor | `CCQMSZDYKY7TO6O65FEH663CISHHNWWUFY7N56GD2CWYGKETELXX554O` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Test USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Soroswap router | `CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD` |
| Soroswap factory | `CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY` |
| Pool / share token | `CCBX3NZTCQLQFSPG7HBOKL4P2RVPOPVFHDNRTOSCCJWBTPL2GHEH7RQS` |

Executor SHA-256: `6586b06fee1a0709dbc7638ea180bf89fc8973aaeaa0b1c7b2811126cb549c5d`.

The SDK checks live bytecode and immutable configuration before preparing an action. Router/factory/pool provenance is also checked. Reset or missing state remains an error. There is no mock fallback.

## Independent example

Use the homepage's integration link to open `/integrations/pool/index.html`, or run `npm.cmd run example:dev` for port 5175. It is a separate TypeScript client using `@caveat/sdk`. It can set up the same exact USDC asset and submit real protected liquidity transactions. Different origins require their own Freighter access permission.

## Contract toolchain

The existing Windows Application Control policy blocks native Cargo build scripts. Use the installed Ubuntu 24.04 WSL environment:

```powershell
wsl.exe -d Ubuntu-24.04 -u root
```

Inside Ubuntu:

```sh
export CARGO_HOME=/var/tmp/caveat-linux-verify/cargo
export RUSTUP_HOME=/var/tmp/caveat-linux-verify/rustup
export PATH="$CARGO_HOME/bin:$PATH"
cd /mnt/c/Users/kolev/Desktop/caveat
bash scripts/verify-contracts.sh
```

A fresh Linux environment needs Rust and `wasm32v1-none` installed. The script checks formatting, runs locked tests, builds all three WASM contracts, and copies artifacts/checksums to the ignored `contracts/target/wasm32v1-none/release/` directory. Keep the lockfile's compatible Ed25519 Dalek resolution.

## Repeat live verification

```powershell
npm.cmd run test:executor:testnet
npm.cmd run test:guard-attacks:testnet
```

The first script creates a disposable Friendbot wallet, uploads/deploys the shared immutable guard, enables USDC, performs a real Soroswap swap and liquidity contribution, verifies direct wallet settlement and empty guard balances, and rejects an impossible minimum in genuine RPC preflight. It updates the SDK's public deployment pin only after all checks pass. Rebuild/restart clients after a deployment change.

The second script uses a fresh disposable wallet to acquire test USDC on the real pool, then funds isolated adversarial venues and deploys separate instances of the **same executor bytecode**. It confirms an honest fixture swap, submits a lying-underpayment transaction and checks complete token rollback apart from fees, and verifies approval/extra-transfer rejection through actual RPC simulation. Fixtures are not DEXs. Published Soroswap configuration is never replaced with fixtures.

Public evidence is written to `docs/evidence/`; keys remain in process memory. These commands submit testnet transactions and consume test XLM. `npm.cmd run test:attack:testnet` is the historical v1 account experiment; label its evidence separately.

See [the live demo guide](DEMO.md) and [verification record](VERIFICATION.md).
