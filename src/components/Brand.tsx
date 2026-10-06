export function AsteriskMark({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" focusable="false">
    <path d="M12 3v18M3 12h18M5.636 5.636l12.728 12.728M5.636 18.364L18.364 5.636"/>
  </svg>
}

export function Brand({ large = false }: { large?: boolean }) {
  return <span className={`wordmark ${large ? 'wordmark-large' : ''}`}>caveat<AsteriskMark className="brand-asterisk"/></span>
}
