# Live demonstration

For a narrated recording, use the [timed video guide](DEMO-VIDEO.md) and [plain-text voice-over](DEMO-VOICEOVER.txt). That edit focuses on the main application and SDK documentation.

The claim: **Caveat is a reusable guard that enforces the outcome of supported actions, funded directly from the wallet.** It supports real swaps and liquidity contributions. Another app must opt in through the SDK. It does not protect ordinary Freighter activity everywhere.

## 1. A real protected swap

Connect Freighter on Testnet. In Wallet setup, enable test USDC if necessary. Choose Swap, enter 2 XLM, wait for the live quote, review the signed conditions and fee, then sign. Open the new ledger receipt and check the wallet's USDC balance.

Say: “I didn't deposit money into Caveat. This transaction takes only my trade amount and returns the result to my wallet. If the result breaks the conditions I sign, the trade is cancelled.”

Recorded current-release [swap proof](https://stellar.expert/explorer/testnet/tx/766cd2f8f6cfcde8e43d1b62c7db740d443cfd4a3090cb18827616541703fa4a): 2 XLM → 0.2114439 test USDC, ledger 5,054,833. Perform a new transaction for the live demo; do not present an old receipt as new execution.

## 2. A different DeFi action

Choose Provide liquidity. Start with a 1-XLM cap; the live pool ratio fills the second token cap. Review the minimum pool shares, both caps and exact share-token address. Sign and inspect the wallet's share receipt.

Say: “This time I’m joining a pool. I limit both tokens I’m putting in and the minimum pool ownership I get back. Caveat measures the actual shares, not what the router says it minted.”

Recorded [liquidity proof](https://stellar.expert/explorer/testnet/tx/a7bc0267c2b394544db81e416fb6627290dd2f1631c8086a22f5768bc0df29a6): 1 XLM + 0.10604 test USDC → 0.3088669 shares, ledger 5,054,836. Later pool value and impermanent loss are outside the checks.

## 3. A separate app using the same guard

Open **the separate integration example** from the homepage. It has its own interface and imports the standalone SDK, with no Caveat React component or internal hook. Connect Freighter, review a small pool deposit and sign a real transaction if sufficient wallet balances remain.

Say: “The protection lives in the contract. This separate app calls the same guard through the SDK. Other developers could integrate it too; apps that don’t integrate it are not protected.”

Label this as our example app, not existing third-party adoption.

## 4. A rejected deal

Back in Swap, enter 1 XLM and set the minimum to 1 test USDC when the quote is well below it. Prepare the intent. Show the real RPC receipt-too-low rejection. Explain that preflight blocked it before a signature; no failing ledger transaction was submitted through this UI. Restore the automatic minimum.

Weak conditions that you willingly sign can still allow a bad deal. The guard checks conditions, not market fairness. Existing DEX minimum-output checks already help swaps; show the reusable boundary and liquidity share checks as the broader implementation.

## 5. A live malicious venue experiment

In the existing Swap form, open **Routed through → Soroswap** and select **Underpaying test contract**. The form sets 1 XLM and a 1.9 test-USDC minimum. Click **Check test contract**. The popup shows a fresh Testnet simulation: the venue claims 2 USDC, attempts to transfer 0.5, and the guard rejects the actual receipt with error 8. Inspect the verified contract addresses and expandable RPC diagnostics.

Select **Forbidden approval test** or **Extra transfer test** to check their authorization failures through the same form and popup. These checks run the deployed fixture contracts against isolated guards with the same executor bytecode. Rates are artificial, and checks are simulation-only: no signing, submission, or network fee. A weak minimum such as 0.4 permits the underpayment and is correctly shown as **Conditions satisfied**. Return the selector to **Soroswap** for normal swaps.

To generate fresh submitted ledger evidence and disposable deployments:

```powershell
npm.cmd run test:guard-attacks:testnet
```

This creates fresh disposable Testnet infrastructure and tests the **new executor bytecode** against isolated venues. It first obtains real test USDC from Soroswap to fund fixtures. The venues are intentionally adversarial contracts with artificial rates, not DEXs. No user secret is needed or read.

| Case | Live result |
| --- | --- |
| Honest: spend 1 XLM, deliver 2 USDC | Ledger success, output returned directly to wallet |
| Lie: claim 2 USDC, deliver 0.5 against a 1.9 minimum | Submitted ledger failure; wallet funding, venue transfers, nonce and allowance roll back |
| Request unlimited approval | Genuine public RPC authorization rejection; zero allowance |
| Spend one extra base unit | Genuine public RPC authorization rejection; balances unchanged |

The [recorded honest swap](https://stellar.expert/explorer/testnet/tx/8c2c8878d22960a94d03dde9a7e0b4d5c78cd5591b9e18fd94938e9f35285572) succeeded at ledger 5,054,873. The [recorded underpayment transaction](https://stellar.expert/explorer/testnet/tx/9817f4f2fedde27fbafb462d3868778e62ee4c1cc1b26e5e83f9d9f368765599) failed at ledger 5,054,878 with the correct guard's error #8. Network fees were charged; all action token movements rolled back. Approval and extra-transfer cases were rejected in preflight and were not submitted.

Open [the current public report](evidence/testnet-guard-attacks.json) to compare before/after balances and diagnostics. Each repeat replaces it with that run's public evidence. Only a passed report establishes a completed experiment. The older `test:attack:testnet` script and report test the earlier prefunded account, and are retained as historical evidence.

End with the boundary: honest pinned token/share accounting, uncompromised wallet, signed terms, two supported actions, opt-in app integration, Testnet only. Keys, issuer powers, fees and transactions elsewhere remain outside these checks.
