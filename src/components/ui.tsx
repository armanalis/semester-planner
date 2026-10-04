import clsx from 'clsx'
import { Check, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../lib/i18n'

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const { t } = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // land on the main field, or on the dialog itself so no button gets a focus ring
      const target = d.querySelector<HTMLElement>('[data-autofocus]') ?? d
      target.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onClose={onClose}
      onPointerDown={(e) => (downOnBackdrop.current = e.target === ref.current)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === ref.current) onClose()
      }}
      className={clsx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-rule bg-sheet p-0 text-ink shadow-[0_24px_60px_-20px_rgb(10_15_30/0.4)]',
        wide ? 'max-w-xl' : 'max-w-md',
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg leading-snug font-bold">{title}</h2>
            <button onClick={onClose} className="btn btn-quiet -mt-1 -mr-2 p-1.5" aria-label={t('close')}>
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** Round pen-drawn checkbox. Fills with the course highlighter when checked. */
export function Tick({
  checked,
  onChange,
  label,
  size = 20,
}: {
  checked: boolean
  onChange: () => void
  label: string
  size?: number
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      style={{ width: size, height: size }}
      className={clsx(
        'grid shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
        checked
          ? 'border-[var(--ink,var(--color-pen))] bg-[var(--hl,var(--color-pen-soft))]'
          : 'border-ink-faint hover:border-ink',
      )}
    >
      {checked && <Check size={size * 0.62} strokeWidth={3} className="text-[var(--ink,var(--color-pen))]" />}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-rule-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-pen text-on-pen' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Progress drawn as a highlighter stroke over a ruled track. */
export function Meter({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      className={clsx('h-2.5 overflow-hidden rounded-full bg-rule/70', className)}
    >
      <div
        className="h-full rounded-full bg-[var(--hl,var(--color-mark))] shadow-[inset_0_0_0_1px_var(--ink,var(--color-mark-ink))] transition-[width] duration-500"
        style={{ width: `${pct}%`, opacity: pct === 0 ? 0 : 1 }}
      />
    </div>
  )
}

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('border-t border-rule-strong pt-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside && <div className="text-sm text-ink-soft">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-ink-soft">
      {children}
    </label>
  )
}
