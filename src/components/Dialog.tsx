import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({ title, children, onClose, busy = false, wide = false, className = '' }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean; className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = ref.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled), summary') ?? []).filter(element => element.getClientRects().length)
    ;(focusable()[0] ?? dialog)?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) closeRef.current()
      if (event.key !== 'Tab' || !dialog) return
      const elements = focusable()
      const first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); dialog.focus() }
      else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [busy, title])
  return (
    <div className="dialog-backdrop" onClick={() => { if (!busy) onClose() }}>
      <section ref={ref} tabIndex={-1} className={`dialog-sheet ${wide ? 'dialog-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
        <button className="dialog-close icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><X size={21}/></button>
        {children}
      </section>
    </div>
  )
}
