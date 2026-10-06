# Caveat voice-over and recording guide

Target duration: approximately **2 minutes 50 seconds**. The timing below is an editing plan; generated speech and ledger confirmation times will vary. Narration is about 310 words. Generate speech from [DEMO-VOICEOVER.txt](DEMO-VOICEOVER.txt), split into its eight paragraphs, then fit each recorded scene to its matching audio clip.

The recording uses the main application and repository documentation. The separate integration app does not need to be opened.

## Recording preparation

- Use the deployed application, a funded Freighter Testnet wallet, and an enabled exact-issuer test USDC trustline. Finish pending transactions before starting.
- Keep enough test XLM for the swap, liquidity contribution, and network fees. The opening 1-XLM swap acquires USDC for the later small pool deposit.
- Record the main app at a readable desktop size, with the Testnet label visible. Open the repository README and SDK reference in another tab.
- Record fresh transactions and contract checks. Record screen footage first, including the complete result of each action, then align it with the voice-over.
- Preserve each scene's sequence: entered conditions, review, signing if required, and observed result. Shorten actual waiting footage with a visible cut or a caption such as "Waiting for ledger confirmation · sped up". Retain the real transaction hash and returned values.
- Keep the test venue's artificial-rate explanation and the popup's simulation label visible. Its check has no signing or submission step.

## Edit timeline

| Time | Screen actions | Voice-over |
| --- | --- | --- |
| 0:00–0:15 | Start on the homepage. Hold the wordmark and headline; move to the swap form and connect Freighter if needed. | Caveat gives your DeFi signature enforceable conditions. Built on Stellar's Soroban platform, it checks what a supported action actually spends and returns. |
| 0:15–0:36 | Select **Swap → Soroswap**. Enter **1 XLM**, let the automatic quote and minimum load, and point to the amount, receipt, expiry, token addresses, and **None allowed** approval rule. Click **Prepare & review intent**. | Here, I'm swapping XLM for test USDC through Soroswap. I set my maximum spend, minimum receipt, and expiry. The exact token addresses are part of the conditions. Approvals are forbidden. The live quote updates automatically, and I review the full transaction before signing. |
| 0:36–1:00 | Show the captured review terms. Click **Sign & submit to testnet**, approve in Freighter, show the real pending state and **Swap complete** popup. Open its transaction link briefly; return to Caveat. | Freighter signs these conditions and the exact funding transfers. Only the amount needed for this action passes through Caveat. The guard checks the actual token receipt and returns the output to my wallet in the same transaction. The confirmation shows the measured result, with a link to the ledger transaction. |
| 1:00–1:34 | Close the popup. In **Swap venue**, choose **Underpaying test contract**. Show **1 XLM**, **1.9 USDC minimum**, and the artificial-rate explanation. Click **Check test contract**. Hold **Blocked by Caveat**, the claim of **2**, and attempted actual delivery of **0.5**. Retain the simulation disclosure. Optional caption: "Isolated test venue · same Caveat executor bytecode". | Now I'm checking a deliberately malicious Testnet venue, using an isolated guard with the same executor code. It claims two USDC, but attempts to deliver only half a USDC against my minimum of one point nine. Caveat reads the actual token movement and rejects it. This is a fresh simulation of deployed contracts, blocked before signing. Nothing was submitted, and my wallet funds stayed untouched. |
| 1:34–1:53 | Close the popup; select **Forbidden approval test**, click **Check test contract**, and show its verified rejection. Repeat for **Extra transfer test**, holding the authorized and attempted amounts. Use the actual results from both fresh checks. | The other test contracts try an unlimited approval and a transfer above my authorized amount. Both are rejected. Caveat grants permission for the exact transfer required by the action. These attempts exceed that permission. |
| 1:53–2:16 | Close the popup. Choose **Provide liquidity**, enter **0.1 XLM**, and show the matched USDC cap and minimum shares. Prepare, review, sign, and hold the actual **Liquidity added** result. Shorten waiting footage if necessary. | The same guard also supports liquidity contributions. I limit both tokens going into the pool and set a minimum number of pool shares. Caveat measures the actual shares received and returns them to my wallet. The protection applies to this deposit's execution. |
| 2:16–2:38 | Switch to the repository. Show the README architecture, then `packages/caveat-sdk/README.md` and its `quote`, `prepare`, signing, and receipt example. Show the SDK source location briefly. | Other apps can integrate these supported actions using the Caveat TypeScript SDK. The package, policy definitions, integration example, and technical documentation are available in the repository. Apps opt in by routing their actions through the guard. This interface demonstrates that integration on Stellar Testnet. |
| 2:38–2:50 | Return to the homepage. End on the logo and headline, with the application and repository links on screen. | Caveat. Your signature. Your terms. Enforced by the transaction. |

## Voice delivery

Use a calm, clear delivery with natural pauses. The narration spells out the malicious venue amounts for speech. Listen to **Caveat**, **Soroswap**, **Soroban**, **XLM**, and **USDC** before exporting. If the selected voice mispronounces the product name, use "KAV-ee-at" in its pronunciation dictionary or a voice-only copy of the script. Exact duration should follow the exported audio; the timeline reserves room for result screens.

## Claims and evidence

Normal swaps and liquidity are submitted Testnet transactions. The malicious UI examples are fresh public RPC simulations of deployed test contracts using pinned isolated guards. Submitted underpayment rollback evidence is also available in [the attack report](evidence/testnet-guard-attacks.json). The SDK is available as source and a buildable local workspace in the repository; it has not been published to npm. Integration is opt-in and covers the supported actions.

The guard validates signed spending and receipt conditions, exact route and token identities, expiry, and per-owner nonce. It restricts nested transfers and grants no approvals. Coverage depends on integration, honest supported token accounting, and the conditions a user authorizes. Market fairness, wallet-key compromise, transactions outside the guard, and later pool-position losses require other controls. There is no measured coverage percentage for real-world bad transactions.

Mainnet readiness requires production network support in the SDK, verified production token/router/factory/pool deployments, executor deployment parity with reviewed bytecode, independent security review, adversarial testing of supported adapters, and operational procedures for fees, archived state, and incidents. Production security practice reference: [Stellar DeFi security standards](https://stellar.org/blog/ecosystem/stellar-defi-security-standards-and-best-practices).
