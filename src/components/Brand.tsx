export function Brand({ large = false }: { large?: boolean }) {
  return <span className={`wordmark ${large ? 'wordmark-large' : ''}`}>caveat<span className="brand-asterisk" aria-hidden="true">✳</span></span>
}
