# Mainnet integration and deployment

Caveat's Mainnet profile uses the Soroswap XLM / Circle USDC pool. The executor release is identical to the Testnet guard: immutable route configuration, wallet funding within each invocation, exact transfer authorization, measured receipts and atomic settlement. Mainnet is an early pilot with independent security review pending.

## Network configuration

| Setting | Value |
| --- | --- |
| Passphrase | `Public Global Stellar Network ; September 2015` |
| RPC | `https://soroban-rpc.mainnet.stellar.gateway.fm` |
| Horizon | `https://horizon.stellar.org` |
| Explorer | `https://stellar.expert/explorer/public` |
| Router | `CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH` |
| Factory | `CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2` |
| Pool / LP token | `CAM7DY53G63XA4AJRS24Z6VFYAFSSF76C3RZ45BE5YU3FQS5255OOABP` |
| Native XLM SAC | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` |
| Circle USDC SAC | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| USDC issuer | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| Executor SHA-256 | `6586b06fee1a0709dbc7638ea180bf89fc8973aaeaa0b1c7b2811126cb549c5d` |
| Executor release size | 29,229 bytes |

The pins are maintained in [`networks.ts`](../packages/caveat-sdk/src/networks.ts). Router, factory and pool hashes match [Soroswap's published Mainnet manifest](https://github.com/soroswap/core/blob/main/public/mainnet.contracts.json). The USDC issuer matches [Circle's contract-address reference](https://developers.circle.com/stablecoins/usdc-contract-addresses). The RPC endpoint is listed in [Stellar's provider directory](https://developers.stellar.org/docs/data/apis/rpc/providers).

The Mainnet executor identifier remains empty until a deployment is confirmed and verified. The application accepts a verified guard selected or deployed through Wallet setup. Each later preparation rechecks that guard's hash, immutable route, underlying asset identities and pool precision.

## Wallet deployment

1. Select **Mainnet** in Freighter and fund the wallet with real XLM sent on the Stellar network. Mainnet has no funding faucet. Testnet balances remain on Testnet.
2. Select **STELLAR MAINNET** in Caveat's action form, connect Freighter and open **Deployment settings**.
3. Select **Review Mainnet deployment**. Review the network, signer, operation, exact route and maximum assembled network fee.
4. If the code is absent, sign **code publication**. Wait for ledger confirmation. Return to Wallet setup and select **Review Mainnet deployment** again.
5. Sign **guard creation** after reviewing its separate fee and immutable route. The confirmed contract address must match the simulated address. Its bytecode and live configuration are verified before the application selects it.
6. Enable the exact Circle USDC trustline in Wallet setup. Review and sign its separate classic transaction. Stellar reserves additional XLM for a trustline.

Deploying an instance creates an executor that supports several wallet owners through independent nonces. Another caller can use **Use an existing Caveat Mainnet guard** to verify and select its address. The deploying wallet receives no administrator, upgrade or withdrawal privileges.

The release WASM is committed at [`contracts/artifacts/caveat_executor.wasm`](../contracts/artifacts/caveat_executor.wasm). The build verifies its SHA-256 and size before serving `/contracts/caveat_executor.wasm`, including clean Vercel builds. The SDK verifies the bytes again before preparing code publication.

### Fees and funding

On October 6, 2026, two independent Mainnet providers estimated **45.6771809 XLM in resource fees** for publishing this release. Inclusion fees are additional. Creation and action fees are calculated in fresh simulations; the historical estimate is not a fee guarantee.

Code publication is shared network infrastructure. Once this code hash is live, later instance deployments reuse it and skip publication. Fees go to the network. Neither publication nor instance creation deposits trading funds into Caveat. Maintain enough wallet XLM for the displayed maximum fee, Stellar reserves and the chosen test amount. Failed submitted transactions can still charge network fees.

## Small execution checks

Perform the following after guard deployment and trustline confirmation. Review the actual fee before every signature.

| Check | Action and evidence |
| --- | --- |
| Forward swap | Swap 1 XLM using the live quote and automatic minimum. Confirm a successful ledger result and measured USDC receipt in the signing wallet. |
| Liquidity | Contribute 0.1 XLM and the quoted matched USDC maximum. Confirm measured spends below both caps and pool shares in the wallet. Pool shares represent continuing pool exposure. |
| Reverse swap | Use the arrow to select USDC → XLM. Choose an amount within the remaining wallet USDC balance; confirm the measured XLM receipt. |
| Impossible minimum | Set a minimum above the current quote and prepare the swap. Expect actual RPC rejection before signing. Revert to the automatic minimum afterward. |
| Guard settlement | Read the executor's XLM, USDC and share balances against their pre-action baselines. Receipts and unused funding should settle to the signing wallet. |

The malicious fixtures remain on Testnet. Mainnet mode exposes the pinned Soroswap route. Those fixture checks continue to run real Testnet simulations without signing or fees.

## SDK configuration

```ts
import { CaveatClient } from '@caveat/sdk'

const guard = new CaveatClient(verifiedMainnetExecutorAddress, undefined, 'mainnet')
await guard.verifyExecutor()
const quote = await guard.quote('swap', '0.1')
const prepared = await guard.prepare(walletAddress, 'swap', {
  amount: '0.1', minimum: quote.minimum, minutes: 10,
})

// Review prepared.network, fee, terms and exact guard.profile.route identities.
// Check the wallet's active network against guard.profile.passphrase before signing.
const signed = await signWithWallet(prepared.xdr, guard.profile.passphrase)
const receipt = await guard.submitSigned(prepared, signed)
```

Preparation captures the network with the signed terms. Submission rejects a preparation for a different network or wallet. Unknown submission results retain the hash of the exact signed body for later confirmation. In the main application, switching networks remounts the action state, discards stale quotes and review snapshots, and reloads only that network's pending operations. A pending transaction locks network switching until its result is resolved.

## Read-only verification

```powershell
npm.cmd run check:mainnet
npm.cmd run check:mainnet -- --executor=C_VERIFIED_MAINNET_GUARD
```

The command checks the RPC passphrase, route hashes, Circle asset identity, pool assets and precision, live quotes in both directions, liquidity quotes, and compatibility of the router/pool argument and success-result types with the tested integration. It validates the versioned executor artifact and estimates publication fees when the code is absent. An optional executor address is checked against the pinned code and configuration.

The command writes public evidence to [`evidence/mainnet-route.json`](evidence/mainnet-route.json). It does not sign, submit, fund or deploy anything. Successful read-only checks establish route compatibility and current network availability. Mainnet execution evidence requires the separate signed transactions described above.
