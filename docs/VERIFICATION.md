# Verification status

Checked locally on 5–6 October 2026:

- TypeScript and Vite production build passed.
- Oxlint passed.
- Seven precision, signing-payload, and deployment tests passed on Node 24. XDR round trips bind all policy fields and the atomic constructor's owner/allowlists. Provenance checks reject substituted executables, and deployment refuses corrupt bytecode, including same-size substitutions. The built WASM matches the browser's release pin. The obsolete offline model and its four model-only tests were removed; contract tests still cover the security behavior.
- Three Edge browser tests cover the testnet-only form, real asset labels, absence of fabricated receipts, input/configuration validation, navigation, desktop/mobile viewport fit, and no runtime errors.
- Desktop (1440px) and mobile (390px) screenshots inspected.
- Stellar SDK and Freighter wallet libraries installed; the browser dynamically loads the real integration module.
- Twelve native Soroban host tests passed in Ubuntu 24.04 WSL using Rust 1.99.0, Cargo 1.99.0, Soroban SDK 23.5.3, and the committed dependency lockfile. No tests were ignored.
- Rust formatting check passed. Both contracts compiled successfully in the optimized release profile for `wasm32v1-none`.
- Both copied WASM files pass standard WebAssembly validation and contain the Soroban environment metadata, contract specification, and expected exported functions.
- Read-only RPC checks confirmed the live published Soroswap router/factory/pair hashes and native XLM / documented test USDC identities, with positive pool reserves. An unsigned Caveat WASM upload simulation succeeded at ledger 5,040,253 and returned the expected release hash; the fee limit was 101,722,295 stroops. No upload, deployment, deposit, or swap was signed or submitted.
- Wallet deployment, deposit, owner recovery, and quote lookup are implemented. Every write requires a review and Freighter signature. Setup pending hashes survive reload for confirmation checks. CI stages the tested artifact for frontend deployment; missing bytecode never becomes a fake deployment.

## Contract evidence

The host tests cover honest balance changes and nonce advancement, replay, expired policies, exact pair identity, immutable token/router allowlists, invalid bounds, mandatory zero approvals, all ten signed policy fields, missing owner authorization, underpayment rollback, forbidden approvals, excess transfers, and owner-only withdrawals.

Underpayment asserts the account's and router's input/output balances and nonce all remain unchanged. Authorization tests inspect fresh host diagnostic events for `Auth/InvalidAction`; Soroban deliberately narrows host errors returned by `try_call` to `Context/InvalidAction`. An unrelated host failure therefore cannot satisfy these tests.

These are local host tests using real Stellar Asset Contracts and a fixture router. Constructor/mint setup uses broad authorization mocking, which is cleared before execution. Each execution receives only an exact mocked owner authorization; the guarded account's nested transfer restrictions run through the host authorization system. The release WASM binaries were compiled and structurally validated, but have not been executed on a ledger.

Release files are in `contracts/target/wasm32v1-none/release/` and remain ignored by Git:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `caveat_account.wasm` | 20,756 | `39671aeb423ecd71bfd6cda8f3b989a736390d90cd634a91d5b0c8e548cfe4f9` |
| `caveat_demo_router.wasm` | 10,162 | `947682a6342f92dcb2d4eb2e2110d6cf317710e191cd203eed67e6571f6e1fe7` |

`SHA256SUMS` accompanies the files. The account exports `__constructor`, `execute`, `nonce`, `owner`, and `withdraw`. The fixture exports `__constructor`, `router_pair_for`, and `swap_exact_tokens_for_tokens`.

Repeat the checks on Linux with `bash scripts/verify-contracts.sh`. See [TESTNET.md](TESTNET.md) to reuse the installed WSL toolchain. The script limits compile jobs and disables host debug symbols to keep memory use manageable. Two SDK deprecation warnings remain for legacy event publication; they did not prevent compilation or testing.

The first compilation found a dependency-resolution issue: Soroban host 23.0.1 accepts `ed25519-dalek >=2.0.0`, but its test utilities' RNG is incompatible with major version 3. The lockfile now resolves compatible version 2.2.0. All verification commands use `--locked` to preserve the tested resolution. Incorrect assertions in the previously unrun tests were also corrected to match the SDK client's raw Soroban error type.

## Remaining verification

Not verified locally:

- Independently recorded upload, account deployment, deposit, and real Soroswap swap evidence. A funded Freighter source and active live pair have been checked, and the user supplied a screenshot of an account holding 5 test XLM. The app runs exclusively on Testnet. Deployment and swap claims should be backed by the actual ledger transactions.
- Ledger-level honest and malicious fixture invocations, including actual RPC errors, balances, nonces, and transaction hashes where submitted.
- Independent security audit or production readiness. The deployed Caveat account's provenance and constructor state cannot be checked until it exists; the browser verifies those before funding and swapping.

Windows Application Control still blocks native Windows build-script executables. Ubuntu WSL provided the supported Linux build environment; no Windows security policy was changed. The updated GitHub Actions workflow uses the same passing contract verification script and uploads WASM files and checksums only after success. These workflow changes have not been run remotely in this session. See [TESTNET.md](TESTNET.md) to record actual ledger evidence. Removing Preview does not replace the need for on-chain verification.
