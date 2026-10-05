# Caveat architecture and threat model

## Product boundary

Caveat is a testnet-first, owner-authorized contract account with a guarded Soroswap executor. Assets must be held at its contract address. This MVP is not a general-purpose SEP smart wallet: it has no arbitrary invocation API or custom `__check_auth`. The owner signs the complete `execute(policy)` invocation using Soroban source-account authorization in a Stellar transaction. There are no off-chain policy signatures or relayers in v1.

The signed policy binds router, pair, exact input/output contract addresses, input amount, maximum spend, minimum receipt, Unix expiry, zero-approval restriction, and sequential nonce. Token symbols are display labels, never identity. The account has immutable owner, token allowlist, and router allowlist supplied at atomic construction. No upgrade or administrator bypass is provided.

## Execution

1. Require owner authorization for the complete policy; validate nonce, amounts, expiry, distinct trusted tokens, trusted router, and the prohibition on approvals.
2. Read account balances from the exact token contracts. Resolve Soroswap's `router_pair_for` and compare it with the signed pair.
3. Authorize only one nested SEP-41 transfer: exact input token, account to signed pair, exact input amount. The router's direct `require_auth(account)` is satisfied by its contract invoker. No `approve`, `transfer_from`, other-token transfer, or arbitrary call is authorized.
4. Call the real Soroswap `swap_exact_tokens_for_tokens` ABI with a two-token path and account as sender/recipient. Pass zero router minimum deliberately; independently enforce the signed receipt after execution.
5. Read balances again. Require actual spend <= maximum and actual receipt >= minimum. Panic on violation so the entire Soroban invocation, nested transfers, and nonce update are rolled back. Success advances nonce and emits measured outcomes.

Net balance deltas are the policy semantics, not gross trading volume. Exact nested transfer authorization independently bounds outgoing funds. Existing external token approvals are outside the model; a freshly deployed account cannot create any through this API. The zero-approval policy is mandatory, not a toggle that enables unlimited approvals.

## Trust and adversaries

Assume honest Stellar consensus, Soroban atomicity/authentication, owner wallet, and SEP-41 implementations in the immutable token allowlist. A malicious token that lies about balance is not protected against. Routers, quotes, return values, UI-provided token labels, and submitted policy inputs are untrusted. A malicious frontend can trick an owner into signing weaker conditions; wallet review and exact addresses remain essential. Fees for failed transactions are not rolled back. Price manipulation that still satisfies the signed bounds is permitted. This does not prevent issuer freeze/clawback, compromised owner keys, denial of service, or spending outside the Caveat account.

Test-only malicious routers belong in separate isolated deployments. Never allow them in an account intended to hold meaningful funds. Recursive attempts cannot pass a second owner authorization/nonce and the Soroban host prevents contract reentry.

## Integration and honest evidence

Frontend: React/TypeScript; Stellar SDK RPC simulation, transaction assembly, Freighter testnet signing, submission and confirmed receipt; no server secrets. Network is fixed to Stellar testnet. Live execution requires a deployed account, verified deployment settings, funded source account, and funded contract token balances. Configuration is explicit. Missing contracts/liquidity or RPC failures remain errors, never fallback execution.

The local demonstration is a deterministic explanatory model with a separate activity log. It is always labeled local and produces no transaction hash. Testnet history records RPC outcomes and only links hashes returned by RPC. Contracts are source-only until built, tested, and deployed using the documented CLI commands. No audit or deployment claim is made by the UI.

## Primary references

- [Soroswap router implementation and ABI](https://github.com/soroswap/core/blob/main/contracts/router/src/lib.rs)
- [Official testnet deployment manifest](https://github.com/soroswap/core/blob/main/public/testnet.contracts.json) (testnet resets can invalidate it; configure and verify live IDs)
- [Stellar contract transactions and authorization](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction)
- [Stellar token interface](https://developers.stellar.org/docs/tokens/token-interface)

## Solo hackathon scope

One two-token Soroswap integration, one owner, zero approvals, bounded transfers, receipt/spend checks, expiry/replay checks, and honest/underpay/approval attack demonstrations. Follow-up work: compiled and deployed end-to-end evidence, independent review, wallet-native policy rendering, persistent ledger indexer, additional adapters, and general smart-account authentication.
