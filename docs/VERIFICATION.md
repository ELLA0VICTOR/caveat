# Verification status

Checked locally on 5 October 2026:

- TypeScript and Vite production build passed.
- Oxlint passed.
- Seven policy/precision and Stellar signing-payload tests passed on Node 24. The XDR round trip binds all exact contract identities, nonce, zero approvals, and integer bounds without losing large-number precision.
- Three Edge browser tests passed: honest/underpayment/approval model outcomes and absence of fabricated explorer hashes; input/configuration validation and navigation; desktop/mobile viewport fit and no runtime errors.
- Desktop (1440px) and mobile (390px) screenshots inspected.
- Stellar SDK and Freighter wallet libraries installed; the browser dynamically loads the real integration module.

Not verified locally:

- Rust host tests and WASM compilation. A project-local Rust GNU toolchain, WASM target, and SDK dependencies were installed. Cargo started compiling dependencies, but Windows Application Control blocked generated native build-script executables (`os error 4551`) even in approved execution outside the sandbox. No security policy was changed. This is not a passing contract build or test result.
- A real Soroswap swap against a deployed Caveat account. No owner wallet signature, funded Caveat deployment, or verified live liquidity pair was supplied. The app therefore defaults to the visibly labeled local model.
- Independent security audit, contract deployment provenance, or production readiness.

The committed Linux GitHub Actions workflow runs frontend checks, Rust host tests, and a WASM build, and publishes build artifacts only after checks pass. It has been prepared locally, not pushed or run remotely. See [TESTNET.md](TESTNET.md) to complete deployment and record actual ledger evidence. Do not describe local model outcomes as smart-contract protection.
