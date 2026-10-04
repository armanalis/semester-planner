/** Graph-paper square with two highlighter strokes. Follows light/dark theme. */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" style={{ fill: 'var(--color-raised)', stroke: 'var(--color-rule-strong)' }} />
      <path d="M8 4v24M16 4v24M24 4v24M4 8h24M4 16h24M4 24h24" style={{ stroke: 'var(--color-rule)' }} strokeWidth="1" />
      <path d="M5 11.5c6-1.2 15-1.6 22-.6l-.4 5.4c-7-.8-15-.5-21.4.6z" style={{ fill: 'light-dark(#fceb8f, #e9d45a)' }} />
      <path d="M5 19.5c6-1.2 13-1.4 18-.6l-.4 5.4c-5-.7-11-.5-17.4.6z" style={{ fill: 'light-dark(#f7c1d5, #f08cb6)' }} />
    </svg>
  )
}
