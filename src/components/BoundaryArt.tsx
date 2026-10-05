// The two brackets represent the signed boundary. Each line is a possible execution.
// Drawn in SVG so the illustration stays sharp and needs no external image request.
export function BoundaryArt() {
  return (
    <svg className="boundary-art" viewBox="0 0 540 260" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="thread-ink" x1="60" y1="100" x2="470" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ink)" />
          <stop offset=".57" stopColor="var(--ink)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path d="M72 228H481" stroke="var(--line)" strokeDasharray="2 5" />
      {Array.from({ length: 46 }, (_, i) => {
        const t = i / 45
        const y = 38 + t * 172
        const twist = Math.sin(t * Math.PI) * 72
        return <path key={i} d={`M72 ${y} C165 ${y - twist}, 147 ${221 - t * 182}, 258 ${218 - t * 174} S350 ${y + twist}, 465 ${y}`} stroke="url(#thread-ink)" strokeWidth=".75" opacity={.45 + Math.sin(t * Math.PI) * .45} />
      })}
      <path d="M83 24H63V219H83M454 24H474V219H454" stroke="var(--ink)" strokeWidth="2" />
      <path d="M66 24H81M457 219H472" stroke="var(--accent)" strokeWidth="3" />
      <circle cx="257" cy="127" r="4" fill="var(--paper)" stroke="var(--accent)" strokeWidth="1.3" />
      <path d="M257 122V96M257 132V158" stroke="var(--accent)" strokeWidth=".7" />
      <text x="64" y="248" fill="var(--muted)" fontFamily="var(--mono)" fontSize="8" letterSpacing="1.7">MANY POSSIBLE OUTCOMES.</text>
      <text x="465" y="248" fill="var(--muted)" fontFamily="var(--mono)" fontSize="8" letterSpacing="1.7" textAnchor="end">ONE SIGNED BOUNDARY.</text>
    </svg>
  )
}
