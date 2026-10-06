# Separate pool-deposit integration

A separately built, plain TypeScript app using `@caveat/sdk` and Freighter. It imports no Caveat React component or internal hook. It makes genuine Testnet liquidity contributions through the same published executor.

Run `npm.cmd run example:dev` from the repository root for port 5175. The normal Caveat dev/build commands also compile and serve it at `/integrations/pool/index.html`. This sibling hosting path is for demo convenience; its build can be hosted independently.

Connect a funded Testnet Freighter wallet. The app loads a live XLM / USDC pool quote, shows the matched test USDC spending cap, and signs a minimum share receipt. If needed, it first offers the exact USDC trustline setup. Fund the USDC side using a small real swap in Caveat; there is no artificial swap balance or faucet fallback.

Review the exact conditions and fee, then sign in Freighter. Successful ledger execution returns shares directly to the wallet. Pending transaction hashes persist and block another deposit until checked. A quote failure disables preparation. No prerecorded outcome is shown.

This is a first-party integration example, not third-party adoption. Its code demonstrates the integration boundary: `quote`, `prepare`, wallet signing, then `submitSigned` through the standalone SDK. See the [SDK guide](../../packages/caveat-sdk/README.md) and [security model](../../docs/ARCHITECTURE.md).
