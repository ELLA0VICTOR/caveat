import { EXECUTOR, EXECUTOR_HASH, HORIZON_URL, ROUTE, ROUTE_HASHES, RPC_URL, USDC_ISSUER } from './deployment.ts'

export type NetworkId = 'testnet' | 'mainnet'
export type Route = { readonly router: string; readonly factory: string; readonly pair: string; readonly token_a: string; readonly token_b: string }
export type NetworkConfig = {
  readonly id: NetworkId; readonly label: 'Testnet' | 'Mainnet'; readonly passphrase: string
  readonly rpcUrl: string; readonly horizonUrl: string; readonly explorer: string
  readonly executor: string; readonly executorHash: string; readonly usdcIssuer: string
  readonly route: Route; readonly routeHashes: { readonly router: string; readonly factory: string; readonly pair: string }
}
export const TESTNET: NetworkConfig = Object.freeze({
  id: 'testnet', label: 'Testnet', passphrase: 'Test SDF Network ; September 2015', rpcUrl: RPC_URL,
  horizonUrl: HORIZON_URL, explorer: 'https://stellar.expert/explorer/testnet',
  executor: EXECUTOR, executorHash: EXECUTOR_HASH, usdcIssuer: USDC_ISSUER,
  route: Object.freeze({ ...ROUTE }), routeHashes: Object.freeze({ ...ROUTE_HASHES }),
})
// Mainnet route verified against live RPC, Soroswap's published hashes and Circle's issuer.
// An empty executor means deployment is required; it never falls back to Testnet.
export const MAINNET: NetworkConfig = Object.freeze({
  id: 'mainnet', label: 'Mainnet', passphrase: 'Public Global Stellar Network ; September 2015',
  rpcUrl: 'https://soroban-rpc.mainnet.stellar.gateway.fm', horizonUrl: 'https://horizon.stellar.org',
  explorer: 'https://stellar.expert/explorer/public', executor: '', executorHash: EXECUTOR_HASH,
  usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  route: Object.freeze({
    router: 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH',
    factory: 'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2',
    pair: 'CAM7DY53G63XA4AJRS24Z6VFYAFSSF76C3RZ45BE5YU3FQS5255OOABP',
    token_a: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    token_b: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  }),
  routeHashes: Object.freeze({
    router: '4c3db3ebd2d6a2ab23de1f622eaabb39501539b4611b68622ec4e47f76c4ba07',
    factory: '5db738b05d9148128a240b0e2c1cb935c2805192bf98a579421aacda364c8dae',
    pair: '18051456816b66f12e773a56f77c5794fac1b1fb7ab6e22d4fad5a412770f73e',
  }),
})
export function networkConfig(id: NetworkId): NetworkConfig {
  if (id !== 'testnet' && id !== 'mainnet') throw new Error('Unsupported Stellar network.')
  return id === 'mainnet' ? MAINNET : TESTNET
}
export function pendingKey(network: NetworkId, kind: 'action' | 'trustline' | 'deployment'): string {
  // Preserve existing Testnet submissions across this release.
  return network === 'testnet' ? `caveat-${kind}-pending` : `caveat-mainnet-${kind}-pending`
}
