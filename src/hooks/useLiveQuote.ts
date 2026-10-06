import { useEffect, useState } from 'react'
import { toUnits } from '../lib/policy'
import type { Action, SwapDirection } from '@caveat/sdk'
import type { Venue } from '../lib/venues'

type QuoteState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  expected?: string
  minimum?: string
  maxB?: string
  error?: string
}

export function useLiveQuote(action: Action, amount: string, paused: boolean, direction: SwapDirection, venue: Venue) {
  const key = JSON.stringify([action, amount, action === 'swap' ? direction : 'xlm-to-usdc', venue])
  const [response, setResponse] = useState<QuoteState | null>(null)
  const [revision, setRevision] = useState(0)
  let valid = true
  try { toUnits(amount) } catch { valid = false }

  useEffect(() => {
    if (!valid || paused) return
    let active = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(async () => {
      setResponse({ key, status: 'loading' })
      try {
        const quote = await Promise.race([
          import('../lib/executor').then(stellar => stellar.quoteAction(action, amount, direction, venue)),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Quote request timed out. Please retry.')), 15000)
          }),
        ])
        if (active) setResponse({ key, status: 'ready', ...quote })
      } catch (error) {
        if (active) setResponse({ key, status: 'error', error: error instanceof Error ? error.message : 'Live quote unavailable.' })
      } finally { clearTimeout(timeout) }
    }, 400)
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout) }
  }, [action, amount, direction, venue, key, paused, revision, valid])

  // A response for an older amount/route is never displayed or used for the minimum.
  const current = valid && response?.key === key ? response : null
  return {
    key,
    status: !valid ? 'idle' as const : current?.status ?? 'loading' as const,
    expected: current?.status === 'ready' ? current.expected! : '',
    minimum: current?.status === 'ready' ? current.minimum! : '',
    maxB: current?.status === 'ready' ? current.maxB ?? '' : '',
    error: current?.status === 'error' ? current.error! : '',
    refresh: () => { setResponse(null); setRevision(previous => previous + 1) },
  }
}
