/** Rounded square with two course-colored bars. */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" style={{ fill: 'var(--color-raised)', stroke: 'var(--color-rule-strong)' }} />
      <rect x="7" y="9" width="18" height="6" rx="3" style={{ fill: 'light-dark(#fcdf6a, #e9d45a)' }} />
      <rect x="7" y="17" width="12" height="6" rx="3" style={{ fill: 'light-dark(#f4a9c7, #f08cb6)' }} />
    </svg>
  )
}
