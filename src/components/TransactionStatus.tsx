import { ArrowRight, ArrowUpRight, Check, LoaderCircle, ShieldCheck, Wallet, X } from 'lucide-react'
import type { TransactionNotice } from '../lib/transaction'
import { transactionHeading } from '../lib/transaction'

export function TransactionStatus({ transaction: t, busy, onClose, onCheck }: {
  transaction: TransactionNotice
  busy: boolean
  onClose: () => void
  onCheck: () => void
}) {
  const waiting = ['wallet', 'submitting', 'pending', 'checking'].includes(t.phase)
  const failed = t.phase === 'failed' || t.phase === 'error'
  const signatureDone = Boolean(t.hash) || t.phase === 'submitting'
  return <div className={`transaction-status transaction-${failed ? 'failed' : t.phase}`}>
    <div className="transaction-eyebrow"><span className="live-dot"/> STELLAR TESTNET <span>{t.verification ? 'LIVE SIMULATION' : 'TRANSACTION'}</span></div>
    <div className="transaction-emblem" aria-hidden="true">{t.phase === 'wallet' ? <Wallet size={29}/> : waiting ? <LoaderCircle size={31} className="loading-icon"/> : t.phase === 'blocked' ? <ShieldCheck size={32}/> : failed ? <X size={31}/> : <Check size={32}/>}</div>
    <div className="transaction-announcement" role="status" aria-live="polite" aria-atomic="true">
      <p className="transaction-action">{t.title}</p>
      <h2>{transactionHeading(t)}</h2>
      <p className="transaction-description">{t.phase === 'confirmed' && t.amounts?.length ? t.kind === 'liquidity' ? 'Confirmed on Stellar. Your pool shares are in your wallet.' : 'Confirmed on Stellar. Your tokens are in your wallet.' : t.detail}</p>
    </div>
    {!failed && !t.verification && <ol className="transaction-steps" aria-label="Transaction progress">
      <li data-complete={signatureDone}><span>{signatureDone ? <Check size={12}/> : '01'}</span>Signature</li>
      <li data-complete={t.phase === 'confirmed'} aria-current={t.phase === 'pending' || t.phase === 'submitting' ? 'step' : undefined}><span>{t.phase === 'confirmed' ? <Check size={12}/> : '02'}</span>Ledger</li>
      <li data-complete={t.phase === 'confirmed'}><span>{t.phase === 'confirmed' ? <Check size={12}/> : '03'}</span>Receipt</li>
    </ol>}
    {['confirmed', 'blocked', 'allowed'].includes(t.phase) && t.amounts?.length ? <dl className="transaction-amounts">{t.amounts.map(amount => <div key={amount.label}><dt>{amount.label}</dt><dd>{amount.value}</dd></div>)}</dl> : null}
    {t.verification && <><p className="transaction-note">{t.phase === 'checking' ? 'Calling the deployed contracts through public Stellar RPC.' : `Checked at ledger ${t.verification.ledger?.toLocaleString('en')}. Simulation only; no transaction was signed or submitted. Your wallet funds were not moved.`}</p><details className="verification-contracts"><summary>{t.phase === 'checking' ? 'Contract addresses' : 'Verified contract addresses'}</summary>{[['Test venue', t.verification.venue], ['Caveat guard', t.verification.guard]].map(([label, address]) => <a key={address} href={`https://stellar.expert/explorer/testnet/contract/${address}`} target="_blank" rel="noreferrer">{label}<code>{address.slice(0, 7)}…{address.slice(-5)}</code><ArrowUpRight size={12}/></a>)}</details></>}
    {t.issue && <details className="transaction-issue"><summary>View error details</summary><p>{t.issue}</p></details>}
    {t.hash && <a className="transaction-explorer" href={`https://stellar.expert/explorer/testnet/tx/${t.hash}`} target="_blank" rel="noreferrer"><span>View on Stellar Expert<code>{t.hash.slice(0, 10)}…{t.hash.slice(-8)}</code></span><ArrowUpRight size={19}/></a>}
    {t.phase === 'pending' ? <>
      <button className="submit-intent" onClick={onCheck} disabled={busy}>{busy ? <><LoaderCircle size={16} className="loading-icon"/> Checking confirmation</> : 'Check confirmation'}<ArrowRight size={18}/></button>
      <p className="transaction-note">Confirmation checks continue automatically. Your submitted transaction stays tracked if you close this window.</p>
    </> : !waiting ? <button className="submit-intent" onClick={onClose} disabled={busy}>Done<ArrowRight size={18}/></button> : t.phase !== 'checking' && <p className="transaction-note">{t.phase === 'wallet' ? 'Open Freighter to confirm the transaction.' : 'Sending the signed transaction to the network.'}</p>}
  </div>
}
